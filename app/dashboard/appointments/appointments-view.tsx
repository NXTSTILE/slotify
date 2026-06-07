"use client";

import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useMemo, useState, useTransition } from "react";
import { updateAppointmentStatusAction } from "@/app/actions/salon";
import { cancelAppointmentAction, rescheduleAppointmentAction } from "@/app/actions/queues";
import { SALON_TIMEZONE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  total_price: number;
  total_duration_minutes: number;
  queue_id: string | null;
  queue_name: string | null;
  customers: { name: string; phone: string } | null;
  appointment_services:
    | { service_id: string; services: { name: string } | null }[]
    | null;
};

function formatLocal(iso: string) {
  return toZonedTime(new Date(iso), SALON_TIMEZONE);
}

export function AppointmentsView({
  initial,
  activeQueues,
}: {
  initial: Row[];
  salonName: string;
  activeQueues: { id: string; name: string }[];
}) {
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [openId, setOpenId] = useState<string | null>(null);

  const weekStart = useMemo(
    () => startOfWeek(anchor, { weekStartsOn: 0 }),
    [anchor]
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const a of initial) {
      const d = format(formatLocal(a.start_time), "yyyy-MM-dd");
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(a);
    }
    return m;
  }, [initial]);

  const selectedDayKey = format(anchor, "yyyy-MM-dd");
  const dayList = byDay.get(selectedDayKey) ?? [];
  const titleDate = view === "day" ? anchor : parseLocalDay(selectedDayKey);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as "week" | "day")}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="day">Day</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setAnchor((a) => addDays(a, view === "week" ? -7 : -1))}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums">
            {view === "week"
              ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
              : format(anchor, "EEEE, MMM d, yyyy")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setAnchor((a) => addDays(a, view === "week" ? 7 : 1))}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
        </div>
      </div>

      {view === "week" ? (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const count = byDay.get(key)?.length ?? 0;
            const isSel = isSameDay(d, anchor);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setAnchor(d)}
                className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                  isSel ? "border-primary bg-accent" : "hover:bg-muted/60"
                }`}
              >
                <div className="font-medium">{format(d, "EEE")}</div>
                <div className="text-muted-foreground">{format(d, "d")}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {count} appt{count === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {format(titleDate, view === "day" ? "EEEE, MMM d, yyyy" : "EEEE, MMM d")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[420px] pr-4">
            <ul className="space-y-2">
              {dayList.length === 0 ? (
                <li className="text-sm text-muted-foreground">No appointments.</li>
              ) : (
                dayList.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/60"
                      onClick={() => setOpenId(a.id)}
                    >
                      <span className="flex flex-col gap-0.5">
                        <span>
                          {format(formatLocal(a.start_time), "hh:mm a")} ·{" "}
                          {a.customers?.name ?? "Customer"}
                        </span>
                        {a.queue_name && (
                          <span className="text-xs text-muted-foreground">
                            📋 {a.queue_name}
                          </span>
                        )}
                      </span>
                      <Badge variant="outline" className="capitalize">{a.status}</Badge>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Appointment</DialogTitle>
          </DialogHeader>
          {openId ? (
            <AppointmentDetailBody
              row={dayList.find((x) => x.id === openId) ?? initial.find((x) => x.id === openId)!}
              activeQueues={activeQueues}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parseLocalDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d!);
}

function AppointmentDetailBody({ 
  row,
  activeQueues,
}: { 
  row: Row;
  activeQueues: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  const svc =
    row.appointment_services
      ?.map((x) => x.services?.name ?? "Service")
      .join(", ") ?? "—";

  const handleComplete = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateAppointmentStatusAction(fd);
      toast.success("Appointment completed!");
    });
  };

  const handleCancel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await cancelAppointmentAction(fd);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Appointment cancelled (alert queued for delivery).");
      }
    });
  };

  const handleReschedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await rescheduleAppointmentAction(fd);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Appointment reassigned (alert queued for delivery).");
      }
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-medium text-base">{row.customers?.name}</p>
        <p className="text-muted-foreground">{row.customers?.phone}</p>
      </div>
      <p className="font-medium text-foreground/80">
        {format(formatLocal(row.start_time), "MMM d, yyyy hh:mm a")} –{" "}
        {format(formatLocal(row.end_time), "hh:mm a")}
      </p>
      {row.queue_name && (
        <p className="flex items-center gap-1.5">
          <span className="text-muted-foreground">📋 Queue:</span>
          <span className="font-medium">{row.queue_name}</span>
        </p>
      )}
      <p>
        <span className="text-muted-foreground">Services:</span> {svc}
      </p>
      <p>
        <span className="text-muted-foreground">Duration:</span> {row.total_duration_minutes} min · <span className="font-medium">₹{Number(row.total_price).toFixed(2)}</span>
      </p>
      <div>
        <Badge variant="outline" className="capitalize">{row.status}</Badge>
      </div>

      {(row.status === "pending" || row.status === "confirmed") && (
        <div className="space-y-4 border-t pt-4">
          {/* Complete action */}
          <form onSubmit={handleComplete} className="flex items-center gap-2">
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="status" value="completed" />
            <Button type="submit" size="sm" disabled={pending}>
              Mark Completed
            </Button>
          </form>

          {/* Reschedule action */}
          <form onSubmit={handleReschedule} className="space-y-2">
            <input type="hidden" name="id" value={row.id} />
            <Label htmlFor={`reschedule-select-${row.id}`} className="text-xs font-semibold text-muted-foreground">Assign to Queue</Label>
            <div className="flex gap-2">
              <select
                id={`reschedule-select-${row.id}`}
                name="queue_id"
                defaultValue={row.queue_id || ""}
                disabled={pending}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">No Queue (Unassigned)</option>
                {activeQueues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                Reassign
              </Button>
            </div>
          </form>

          {/* Cancel action */}
          <form onSubmit={handleCancel} className="space-y-2 bg-destructive/5 rounded-lg p-3 border border-destructive/10">
            <input type="hidden" name="id" value={row.id} />
            <Label htmlFor={`reason-${row.id}`} className="text-xs font-semibold text-destructive/80">Cancel Appointment</Label>
            <Textarea
              id={`reason-${row.id}`}
              name="reason"
              placeholder="Cancellation reason (notified to customer)"
              rows={2}
              disabled={pending}
              className="bg-background border-input"
            />
            <Button type="submit" variant="destructive" size="sm" className="w-full" disabled={pending}>
              Cancel Appointment
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
