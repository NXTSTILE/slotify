"use client";

import { useFormState } from "react-dom";
import {
  addHolidayFormAction,
  deleteHolidayFormAction,
  updateSalonProfileFormAction,
  updateWhatsAppConnectionFormAction,
  upsertWorkingHourFormAction,
  type SettingsFormState,
} from "@/app/actions/salon";
import type { ServicesDisplayMode } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeForInput(t: string | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function SettingsView({
  salon,
  workingHours,
  holidays,
}: {
  salon: {
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    cancellation_policy: string | null;
    services_display_mode: ServicesDisplayMode;
    whatsapp_phone_number_id: string | null;
    whatsapp_access_token: string | null;
    whatsapp_business_account_id: string | null;
  };
  workingHours: {
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    break_start_time: string | null;
    break_end_time: string | null;
    is_closed: boolean;
  }[];
  holidays: { id: string; date: string; reason: string | null }[];
}) {
  const byDay = new Map(workingHours.map((r) => [r.day_of_week, r]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Salon profile, WhatsApp Cloud API, hours, and holidays used for booking.
        </p>
      </div>

      <SalonProfileCard salon={salon} />

      <WhatsAppCard salon={salon} />

      <Card>
        <CardHeader>
          <CardTitle>Working hours</CardTitle>
          <CardDescription>
            Times use your salon timezone (Asia/Kolkata). Days match calendar weekday (0 = Sunday).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {DAY_LABELS.map((label, day) => {
            const row = byDay.get(day);
            return (
              <WorkingDayRow
                key={day}
                label={label}
                dayOfWeek={day}
                defaultOpen={timeForInput(row?.open_time ?? null) || "09:00"}
                defaultClose={timeForInput(row?.close_time ?? null) || "18:00"}
                defaultBreakStart={timeForInput(row?.break_start_time ?? null) || "13:00"}
                defaultBreakEnd={timeForInput(row?.break_end_time ?? null) || "13:00"}
                defaultClosed={row?.is_closed ?? false}
              />
            );
          })}
        </CardContent>
      </Card>

      <HolidaysCard holidays={holidays} />

      <Separator />
      <p className="text-xs text-muted-foreground">
        Webhook URL for Meta: <code className="rounded bg-muted px-1 py-0.5">/api/whatsapp/webhook</code> on your
        deployed domain, with the verify token you configure in environment variables.
      </p>
    </div>
  );
}

function SalonProfileCard({
  salon,
}: {
  salon: {
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    cancellation_policy: string | null;
    services_display_mode: ServicesDisplayMode;
  };
}) {
  const [state, formAction] = useFormState(updateSalonProfileFormAction, {} satisfies SettingsFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salon profile</CardTitle>
        <CardDescription>Shown to you in the dashboard; some fields may be referenced in customer messages.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Salon name</Label>
            <Input id="name" name="name" defaultValue={salon.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Business phone</Label>
            <Input id="phone" name="phone" defaultValue={salon.phone} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={salon.city ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" defaultValue={salon.address ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cancellation_policy">Cancellation policy</Label>
            <Textarea
              id="cancellation_policy"
              name="cancellation_policy"
              rows={3}
              defaultValue={salon.cancellation_policy ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="services_display_mode">WhatsApp service list</Label>
            <select
              id="services_display_mode"
              name="services_display_mode"
              defaultValue={salon.services_display_mode}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="grouped">Grouped by category</option>
              <option value="flat">Flat list</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit">Save profile</Button>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {state.error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function WhatsAppCard({
  salon,
}: {
  salon: {
    whatsapp_phone_number_id: string | null;
    whatsapp_access_token: string | null;
    whatsapp_business_account_id: string | null;
  };
}) {
  const [state, formAction] = useFormState(updateWhatsAppConnectionFormAction, {} satisfies SettingsFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp Cloud API</CardTitle>
        <CardDescription>
          From Meta Developer Console. Leave a field empty to leave the stored value unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp_phone_number_id">Phone number ID</Label>
            <Input
              id="whatsapp_phone_number_id"
              name="whatsapp_phone_number_id"
              defaultValue={salon.whatsapp_phone_number_id ?? ""}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_business_account_id">WhatsApp Business Account ID</Label>
            <Input
              id="whatsapp_business_account_id"
              name="whatsapp_business_account_id"
              defaultValue={salon.whatsapp_business_account_id ?? ""}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_access_token">Permanent access token</Label>
            <Input
              id="whatsapp_access_token"
              name="whatsapp_access_token"
              type="password"
              placeholder={salon.whatsapp_access_token ? "•••••••• (saved)" : ""}
              autoComplete="off"
            />
          </div>
          <div>
            <Button type="submit">Save WhatsApp credentials</Button>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function WorkingDayRow({
  label,
  dayOfWeek,
  defaultOpen,
  defaultClose,
  defaultBreakStart,
  defaultBreakEnd,
  defaultClosed,
}: {
  label: string;
  dayOfWeek: number;
  defaultOpen: string;
  defaultClose: string;
  defaultBreakStart: string;
  defaultBreakEnd: string;
  defaultClosed: boolean;
}) {
  const [state, formAction] = useFormState(upsertWorkingHourFormAction, {} satisfies SettingsFormState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <input type="hidden" name="day_of_week" value={dayOfWeek} />
      <div className="min-w-[8rem] font-medium text-sm">{label}</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Open</Label>
          <Input name="open_time" type="time" defaultValue={defaultClosed ? "" : defaultOpen} className="w-[7.5rem]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Break Start</Label>
          <Input name="break_start_time" type="time" defaultValue={defaultClosed ? "" : defaultBreakStart} className="w-[7.5rem]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Break End</Label>
          <Input name="break_end_time" type="time" defaultValue={defaultClosed ? "" : defaultBreakEnd} className="w-[7.5rem]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Close</Label>
          <Input name="close_time" type="time" defaultValue={defaultClosed ? "" : defaultClose} className="w-[7.5rem]" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_closed" value="true" defaultChecked={defaultClosed} id={`closed-${dayOfWeek}`} />
          Closed
        </label>
        <Button type="submit" size="sm" variant="secondary">
          Save
        </Button>
      </div>
      {state.error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function HolidaysCard({ holidays }: { holidays: { id: string; date: string; reason: string | null }[] }) {
  const [addState, addFormAction] = useFormState(addHolidayFormAction, {} satisfies SettingsFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Holidays</CardTitle>
        <CardDescription>Customers cannot book on these dates (Asia/Kolkata calendar).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={addFormAction} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="holiday-date">Date</Label>
            <Input id="holiday-date" name="date" type="date" required className="w-auto" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="holiday-reason">Note (optional)</Label>
            <Input id="holiday-reason" name="reason" placeholder="Diwali" className="min-w-[12rem]" />
          </div>
          <Button type="submit" size="sm">
            Add holiday
          </Button>
          {addState.error ? (
            <p className="w-full text-sm text-destructive" role="alert">
              {addState.error}
            </p>
          ) : null}
        </form>

        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holidays yet.</p>
        ) : (
          <ul className="space-y-2">
            {holidays.map((h) => (
              <HolidayRow key={h.id} holiday={h} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HolidayRow({ holiday }: { holiday: { id: string; date: string; reason: string | null } }) {
  const [state, formAction] = useFormState(deleteHolidayFormAction, {} satisfies SettingsFormState);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="text-sm">
        <span className="font-medium">{holiday.date}</span>
        {holiday.reason ? <span className="text-muted-foreground"> — {holiday.reason}</span> : null}
      </div>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={holiday.id} />
        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
          Remove
        </Button>
        {state.error ? (
          <span className="text-xs text-destructive" role="alert">
            {state.error}
          </span>
        ) : null}
      </form>
    </li>
  );
}
