import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getQueues } from "@/app/actions/queues";
import { QueueManager } from "./queue-manager";
import { ListOrdered } from "lucide-react";

export const metadata = {
  title: "Queues — Nxtstile",
  description: "Manage your active salon queues to balance walk-in and online appointments.",
};

export default async function QueuesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const salonRes = await db.query(
    "SELECT id, name FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) redirect("/setup");

  // Load all queues for the salon
  const queues = await getQueues(salon.id);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Queues</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your active salon queues (e.g. Chair 1, Chair 2, Queue A). Customers will be auto-assigned
          to these queues based on earliest availability.
        </p>
      </div>

      {/* Info card */}
      <div className="rounded-xl border bg-muted/40 px-5 py-4 text-sm space-y-1">
        <p className="font-medium text-foreground">How Queue Auto-Assignment Works</p>
        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground text-xs">
          <li>
            <strong>Earliest free slot</strong> — the active queue whose next free gap (latest appointment end + buffer) is earliest after the requested time is selected.
          </li>
          <li>
            <strong>Load balancing</strong> — this logic distributes customers automatically across your queues to maximize throughput and minimize customer wait times.
          </li>
        </ol>
      </div>

      <QueueManager initialQueues={queues} />
    </div>
  );
}
