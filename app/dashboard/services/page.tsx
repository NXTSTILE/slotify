import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { salon } = await getSalonForUser(supabase, user.id);
  if (!salon) return null;

  const { data: categories } = await supabase
    .from("service_categories")
    .select("*")
    .eq("salon_id", salon.id)
    .order("display_order", { ascending: true });

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("salon_id", salon.id)
    .order("display_order", { ascending: true });

  const svcList = services ?? [];

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
                {(categories ?? []).map((c) => (
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
            <div className="flex items-end">
              <Button type="submit">Save service</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <ServicesReorder
        categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
        services={svcList.map((s) => ({
          id: s.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: Number(s.price),
          category_id: s.category_id,
          is_active: s.is_active,
        }))}
      />

      {(categories ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(categories ?? []).map((c) => (
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
