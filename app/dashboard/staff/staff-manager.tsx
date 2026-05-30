"use client";

import { useState, useTransition } from "react";
import {
  addStaffAction,
  updateStaffAction,
  deleteStaffAction,
  toggleStaffActiveAction,
} from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  UserPlus,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  Star,
  Sparkles,
} from "lucide-react";

type ServiceOption = { id: string; name: string };

type StaffMember = {
  id: string;
  name: string;
  is_active: boolean;
  services: ServiceOption[];
};

interface StaffManagerProps {
  initialStaff: StaffMember[];
  allServices: ServiceOption[];
}

export function StaffManager({ initialStaff, allServices }: StaffManagerProps) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [pending, startTransition] = useTransition();

  // ─── Add form state ───
  const [addName, setAddName] = useState("");
  const [addServices, setAddServices] = useState<string[]>([]);

  // ─── Edit form state ───
  const [editName, setEditName] = useState("");
  const [editServices, setEditServices] = useState<string[]>([]);

  function openEdit(member: StaffMember) {
    setEditTarget(member);
    setEditName(member.name);
    setEditServices(member.services.map((s) => s.id));
  }

  function toggleService(sid: string, selected: string[], setSelected: (v: string[]) => void) {
    setSelected(
      selected.includes(sid) ? selected.filter((x) => x !== sid) : [...selected, sid]
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || addServices.length === 0) {
      toast.error("Name and at least one service are required.");
      return;
    }
    const fd = new FormData();
    fd.append("name", addName.trim());
    fd.append("serviceIds", JSON.stringify(addServices));
    startTransition(async () => {
      const res = await addStaffAction(fd);
      if (res.ok) {
        toast.success("Staff member added!");
        setAddOpen(false);
        setAddName("");
        setAddServices([]);
        // optimistic update
        const newMember: StaffMember = {
          id: crypto.randomUUID(),
          name: addName.trim(),
          is_active: true,
          services: allServices.filter((s) => addServices.includes(s.id)),
        };
        setStaff((prev) => [...prev, newMember].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        toast.error(res.error ?? "Failed to add staff.");
      }
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim() || editServices.length === 0) {
      toast.error("Name and at least one service are required.");
      return;
    }
    const fd = new FormData();
    fd.append("id", editTarget.id);
    fd.append("name", editName.trim());
    fd.append("serviceIds", JSON.stringify(editServices));
    startTransition(async () => {
      const res = await updateStaffAction(fd);
      if (res.ok) {
        toast.success("Staff member updated!");
        setEditTarget(null);
        setStaff((prev) =>
          prev.map((m) =>
            m.id === editTarget.id
              ? {
                  ...m,
                  name: editName.trim(),
                  services: allServices.filter((s) => editServices.includes(s.id)),
                }
              : m
          )
        );
      } else {
        toast.error(res.error ?? "Failed to update staff.");
      }
    });
  }

  async function handleToggleActive(member: StaffMember) {
    const fd = new FormData();
    fd.append("id", member.id);
    fd.append("is_active", String(!member.is_active));
    startTransition(async () => {
      const res = await toggleStaffActiveAction(fd);
      if (res.ok) {
        setStaff((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, is_active: !m.is_active } : m))
        );
        toast.success(member.is_active ? "Staff deactivated." : "Staff activated.");
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
      const res = await deleteStaffAction(fd);
      if (res.ok) {
        toast.success("Staff member removed.");
        setStaff((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        toast.error(res.error ?? "Failed to delete.");
      }
    });
  }

  const isGeneralist = (member: StaffMember) =>
    member.services.length === allServices.length;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div />
        <Button
          id="add-staff-btn"
          onClick={() => setAddOpen(true)}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Add Staff
        </Button>
      </div>

      {/* Staff grid */}
      {staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Sparkles className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No staff added yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Add your team and assign the services they specialize in.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="h-4 w-4" />
            Add first staff member
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((member) => (
            <div
              key={member.id}
              className={`group relative flex flex-col gap-3 rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${
                member.is_active
                  ? "bg-card"
                  : "bg-muted/40 opacity-60"
              }`}
            >
              {/* Name row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-base">{member.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {member.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
                {isGeneralist(member) && (
                  <span
                    title="Generalist — can do all services"
                    className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    <Star className="h-3 w-3" />
                    All-rounder
                  </span>
                )}
              </div>

              {/* Service badges */}
              <div className="flex flex-wrap gap-1.5">
                {member.services.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No services assigned</span>
                ) : (
                  member.services.map((s) => (
                    <Badge key={s.id} variant="secondary" className="text-[11px]">
                      {s.name}
                    </Badge>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 border-t pt-3 mt-auto">
                <Button
                  id={`edit-staff-${member.id}`}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openEdit(member)}
                  disabled={pending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  id={`toggle-staff-${member.id}`}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleToggleActive(member)}
                  disabled={pending}
                >
                  {member.is_active ? (
                    <>
                      <UserX className="h-3.5 w-3.5" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      Activate
                    </>
                  )}
                </Button>
                <Button
                  id={`delete-staff-${member.id}`}
                  variant="ghost"
                  size="sm"
                  className="ml-auto gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(member)}
                  disabled={pending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Add Dialog ─── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Add Staff Member</DialogTitle>
            </DialogHeader>
            <div className="grid gap-5 py-5">
              <div className="grid gap-2">
                <Label htmlFor="add-staff-name">Full Name</Label>
                <Input
                  id="add-staff-name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Riya Sharma"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Services they can perform</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Staff who can perform all services are treated as generalists (lowest priority during auto-assign).
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  {allServices.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`add-svc-${s.id}`}
                        checked={addServices.includes(s.id)}
                        onCheckedChange={() =>
                          toggleService(s.id, addServices, setAddServices)
                        }
                      />
                      <label
                        htmlFor={`add-svc-${s.id}`}
                        className="text-sm leading-none cursor-pointer"
                      >
                        {s.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} className="gap-2">
                <UserPlus className="h-4 w-4" />
                {pending ? "Adding…" : "Add Staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Edit Staff Member</DialogTitle>
            </DialogHeader>
            <div className="grid gap-5 py-5">
              <div className="grid gap-2">
                <Label htmlFor="edit-staff-name">Full Name</Label>
                <Input
                  id="edit-staff-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Services they can perform</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  {allServices.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`edit-svc-${s.id}`}
                        checked={editServices.includes(s.id)}
                        onCheckedChange={() =>
                          toggleService(s.id, editServices, setEditServices)
                        }
                      />
                      <label
                        htmlFor={`edit-svc-${s.id}`}
                        className="text-sm leading-none cursor-pointer"
                      >
                        {s.name}
                      </label>
                    </div>
                  ))}
                </div>
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

      {/* ─── Delete Confirm Dialog ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Remove Staff Member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            <strong>{deleteTarget?.name}</strong> will be removed. Past appointments will
            remain unchanged.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              id="confirm-delete-staff"
              variant="destructive"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending ? "Removing…" : "Yes, Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
