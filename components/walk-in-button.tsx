"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { addWalkInBookingAction } from "@/app/actions/salon";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface Subservice {
  id: string;
  name: string;
  price: number;
}

interface ServiceCategory {
  id: string;
  name: string;
  subservices: Subservice[];
}

export function WalkInButton({ services }: { services: ServiceCategory[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedServices.length === 0) {
      toast.error("Please select at least one service.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone);
    formData.append("serviceIds", JSON.stringify(selectedServices));

    const res = await addWalkInBookingAction(formData);
    setLoading(false);

    if (res.ok) {
      toast.success("Walk-in added to queue!");
      setOpen(false);
      setName("");
      setPhone("");
      setSelectedServices([]);
    } else {
      toast.error(res.error || "Failed to add walk-in.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Walk-in
        </Button>
      } />
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Walk-in Customer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Customer Name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone (Optional)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Services & Subservices</Label>
              <div className="grid gap-4 max-h-[300px] overflow-y-auto pr-2 border rounded-md p-3 bg-muted/20">
                {services.map((cat) => (
                  <div key={cat.id} className="space-y-2">
                    <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider border-b pb-1">{cat.name}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {cat.subservices.map((s) => (
                        <div key={s.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={s.id}
                            checked={selectedServices.includes(s.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedServices([...selectedServices, s.id]);
                              } else {
                                setSelectedServices(
                                  selectedServices.filter((id) => id !== s.id)
                                );
                              }
                            }}
                          />
                          <label
                            htmlFor={s.id}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {s.name} <span className="text-muted-foreground font-normal text-xs">(₹{Number(s.price).toFixed(0)})</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add to Queue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
