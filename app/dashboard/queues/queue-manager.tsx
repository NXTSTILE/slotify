"use client";

import { useState, useTransition } from "react";
import {
  addQueueAction,
  updateQueueAction,
  deleteQueueAction,
  toggleQueueActiveAction,
} from "@/app/actions/queues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Sparkles,
} from "lucide-react";

type Queue = {
  id: string;
  name: string;
  is_active: boolean;
};

interface QueueManagerProps {
  initialQueues: Queue[];
}

export function QueueManager({ initialQueues }: QueueManagerProps) {
  const [queues, setQueues] = useState<Queue[]>(initialQueues);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Queue | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Queue | null>(null);
  const [pending, startTransition] = useTransition();

  // Add form state
  const [addName, setAddName] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) {
      toast.error("Queue name is required.");
      return;
    }
    const fd = new FormData();
    fd.append("name", addName.trim());
    startTransition(async () => {
      const res = await addQueueAction(fd);
      if (res.ok) {
        toast.success("Queue added successfully!");
        setAddOpen(false);
        setAddName("");
        // optimistic update / local update
        const newQueue: Queue = {
          id: crypto.randomUUID(),
          name: addName.trim(),
          is_active: true,
        };
        setQueues((prev) => [...prev, newQueue].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        toast.error(res.error ?? "Failed to add queue.");
      }
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim()) {
      toast.error("Queue name is required.");
      return;
    }
    const fd = new FormData();
    fd.append("id", editTarget.id);
    fd.append("name", editName.trim());
    startTransition(async () => {
      const res = await updateQueueAction(fd);
      if (res.ok) {
        toast.success("Queue renamed!");
        setEditTarget(null);
        setQueues((prev) =>
          prev.map((q) =>
            q.id === editTarget.id ? { ...q, name: editName.trim() } : q
          )
        );
      } else {
        toast.error(res.error ?? "Failed to update queue.");
      }
    });
  }

  async function handleToggleActive(queue: Queue) {
    const fd = new FormData();
    fd.append("id", queue.id);
    fd.append("is_active", String(!queue.is_active));
    startTransition(async () => {
      const res = await toggleQueueActiveAction(fd);
      if (res.ok) {
        setQueues((prev) =>
          prev.map((q) => (q.id === queue.id ? { ...q, is_active: !q.is_active } : q))
        );
        toast.success(queue.is_active ? "Queue deactivated." : "Queue activated.");
      } else {
        toast.error(res.error ?? "Failed.");
      }
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.append("id", deleteTarget.id);
    startTransition(async () => {
      const res = await deleteQueueAction(fd);
      if (res.ok) {
        toast.success("Queue removed.");
        setQueues((prev) => prev.filter((q) => q.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        toast.error(res.error ?? "Failed to delete queue.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header action */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground/80">Active Salon Queues</h2>
        <Button
          id="add-queue-btn"
          onClick={() => setAddOpen(true)}
          className="gap-2 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md"
        >
          <Plus className="h-4 w-4" />
          Add Queue
        </Button>
      </div>

      {/* Queues Grid */}
      {queues.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center bg-muted/10">
          <Sparkles className="mb-3 h-10 w-10 text-muted-foreground/30 animate-pulse" />
          <p className="text-sm font-medium text-muted-foreground">No queues created yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60 max-w-sm">
            Create queues (chairs, service stations, or zones) so appointments can be distributed dynamically.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2 border-primary/20 hover:border-primary/40"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 text-primary" />
            Add first queue
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queues.map((queue) => (
            <div
              key={queue.id}
              className={`group relative flex flex-col gap-4 rounded-xl border p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/20 ${
                queue.is_active
                  ? "bg-card border-border"
                  : "bg-muted/30 border-muted opacity-70"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-base tracking-tight">{queue.name}</p>
                  <span className={`inline-flex items-center gap-1 mt-1 text-xs font-medium ${
                    queue.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  }`}>
                    {queue.is_active ? (
                      <>
                        <CheckCircle className="h-3 w-3" />
                        Online & Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" />
                        Inactive
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 border-t pt-3 mt-auto">
                <Button
                  id={`edit-queue-${queue.id}`}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 hover:bg-muted"
                  onClick={() => {
                    setEditTarget(queue);
                    setEditName(queue.name);
                  }}
                  disabled={pending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </Button>
                <Button
                  id={`toggle-queue-${queue.id}`}
                  variant="outline"
                  size="sm"
                  className={`gap-1.5 transition-all ${
                    queue.is_active 
                      ? "hover:bg-destructive/5 hover:text-destructive" 
                      : "hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/20"
                  }`}
                  onClick={() => handleToggleActive(queue)}
                  disabled={pending}
                >
                  {queue.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  id={`delete-queue-${queue.id}`}
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  onClick={() => setDeleteTarget(queue)}
                  disabled={pending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Add Salon Queue</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="add-queue-name">Queue Name</Label>
                <Input
                  id="add-queue-name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Chair 1, Station A"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add Queue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Rename Queue</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-queue-name">Queue Name</Label>
                <Input
                  id="edit-queue-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete Queue?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to remove <strong>{deleteTarget?.name}</strong>? 
            Past appointments associated with this queue will retain their record, but no new bookings will be assigned to it.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              id="confirm-delete-queue"
              variant="destructive"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending ? "Removing…" : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
