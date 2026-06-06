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
  // 1. Fetch user session
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Load salon info
  const salonRes = await db.query(
    "SELECT id FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (!salon) {
    redirect("/setup");
  }

  // 3. Query all categories in order
  const catRes = await db.query(
    "SELECT * FROM public.service_categories WHERE salon_id = $1 ORDER BY display_order ASC",
    [salon.id]
  );
  const categories = catRes.rows;

  // 4. Query all services in order
  const svcRes = await db.query(
    "SELECT * FROM public.services WHERE salon_id = $1 ORDER BY display_order ASC",
    [salon.id]
  );
  const services = svcRes.rows;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="text-sm text-muted-foreground">
          Drag rows to reorder. Durations must be multiples of 5 minutes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New category</CardTitle>
          <CardDescription>Group services for the WhatsApp catalog (when display mode is grouped).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitAddCategory} className="flex flex-wrap gap-2">
            <Input name="name" placeholder="Category name" required className="max-w-xs" />
            <Button type="submit" size="sm">
              Add category
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add service</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submitAddService} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
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
              <Label htmlFor="category_id">Category</Label>
              <select
                id="category_id"
                name="category_id"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
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
            <div className="flex items-end">
              <Button type="submit">Save service</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <ServicesReorder
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: Number(s.price),
          category_id: s.category_id,
          is_active: s.is_active,
          gender_tag: s.gender_tag,
        }))}
      />

      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <form key={c.id} action={submitDeleteCategory} className="inline">
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" variant="outline" size="sm">
                  Delete {c.name}
                </Button>
              </form>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
