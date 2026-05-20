"use client";

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useState } from "react";
import { SALON_TIMEZONE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Customer = { id: string; name: string; phone: string; created_at: string };
type Apt = {
  id: string;
  customer_id: string;
  start_time: string;
  status: string;
  total_price: number;
};

export function CustomersTable({
  customers,
  appointments,
  stats,
}: {
  customers: Customer[];
  appointments: Apt[];
  stats: Record<string, { count: number; last?: string; revenue: number }>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Bookings</TableHead>
          <TableHead>Last visit</TableHead>
          <TableHead className="w-28" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((c) => {
          const s = stats[c.id];
          const rows = appointments
            .filter((a) => a.customer_id === c.id)
            .sort(
              (a, b) =>
                new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
            );
          return (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name || "—"}</TableCell>
              <TableCell>{c.phone}</TableCell>
              <TableCell>{s?.count ?? 0}</TableCell>
              <TableCell>
                {s?.last
                  ? format(toZonedTime(new Date(s.last), SALON_TIMEZONE), "d MMM yyyy")
                  : "—"}
              </TableCell>
              <TableCell>
                <HistoryDialog name={c.name} phone={c.phone} rows={rows} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function HistoryDialog({
  name,
  phone,
  rows,
}: {
  name: string;
  phone: string;
  rows: Apt[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        History
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {name || "Customer"} · {phone}
            </DialogTitle>
          </DialogHeader>
          <ul className="max-h-80 space-y-2 overflow-auto text-sm">
            {rows.length === 0 ? (
              <li className="text-muted-foreground">No bookings yet.</li>
            ) : (
              rows.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b pb-2">
                  <span>
                    {format(
                      toZonedTime(new Date(a.start_time), SALON_TIMEZONE),
                      "d MMM yyyy hh:mm a"
                    )}
                  </span>
                  <Badge variant="outline">{a.status}</Badge>
                  <span className="text-muted-foreground">₹{Number(a.total_price).toFixed(2)}</span>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
