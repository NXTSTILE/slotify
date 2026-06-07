import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  submitAddCategory,
  submitAddService,
  submitDeleteCategory,
} from "@/app/actions/salon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ServicesReorder } from "./services-reorder";

export default async function ServicesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const salonRes = await db.query(
    "SELECT id FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) {
    redirect("/setup");
  }

  // Categories are now called "Services"
  const serviceRes = await db.query(
    "SELECT * FROM public.services WHERE salon_id = $1 ORDER BY display_order ASC",
    [salon.id]
  );
  const services = serviceRes.rows;

  // Services are now called "Subservices"
  const subserviceRes = await db.query(
    "SELECT * FROM public.subservices WHERE salon_id = $1 ORDER BY display_order ASC",
    [salon.id]
  );
  const subservices = subserviceRes.rows;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manage Services</h1>
        <p className="text-sm text-muted-foreground">
          Create service groups (e.g., Hair, Nails) and add specific subservices under them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Service Group</CardTitle>
          <CardDescription>Top-level category for your WhatsApp catalog.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitAddCategory} className="flex flex-wrap gap-2">
            <Input name="name" placeholder="Service group name (e.g., Hair)" required className="max-w-xs" />
            <Button type="submit" size="sm">
              Add Service
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Subservice</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submitAddService} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="e.g., Haircut" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration_minutes">Duration (min)</Label>
              <Input id="duration_minutes" name="duration_minutes" type="number" step={5} min={5} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (₹)</Label>
              <Input id="price" name="price" type="number" step="0.01" min={0} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_id">Service Group</Label>
              <select
                id="service_id"
                name="service_id"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Select...</option>
                {services.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tier">Tier (Optional)</Label>
              <select
                id="tier"
                name="tier"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">None</option>
                <option value="basic">Basic</option>
                <option value="medium">Medium</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_active_new">Visibility</Label>
              <select
                id="is_active_new"
                name="is_active"
                defaultValue="true"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender_tag">Gender</Label>
              <select
                id="gender_tag"
                name="gender_tag"
                defaultValue="unisex"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="unisex">Unisex</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="flex items-end lg:col-span-2">
              <Button type="submit">Save subservice</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <ServicesReorder
        services={services.map((c) => ({ id: c.id, name: c.name }))}
        subservices={subservices.map((s) => ({
          id: s.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: Number(s.price),
          service_id: s.service_id,
          is_active: s.is_active,
          gender_tag: s.gender_tag,
          tier: s.tier || null,
        }))}
      />
    </div>
  );
}
