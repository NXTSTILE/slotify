"use client";

import { useState } from "react";
import {
  submitDeleteCategory,
  submitDeleteService,
  submitUpdateService,
} from "@/app/actions/salon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Edit2 } from "lucide-react";

type Subservice = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  service_id: string | null;
  is_active: boolean;
  gender_tag: string;
  tier: string | null;
  extra_category: string | null;
};

type ServiceGroup = {
  id: string;
  name: string;
  gender_tag: string;
};

export function ServicesReorder({
  services,
  subservices,
  showExtraCategory,
}: {
  services: ServiceGroup[];
  subservices: Subservice[];
  showExtraCategory: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {services.map((service) => {
        const isExpanded = expandedId === service.id;
        const groupSubservices = subservices.filter((s) => s.service_id === service.id);

        return (
          <Card key={service.id} className="overflow-hidden">
            <div
              className="flex cursor-pointer items-center justify-between bg-muted/50 p-4 transition-colors hover:bg-muted"
              onClick={() => setExpandedId(isExpanded ? null : service.id)}
            >
              <div className="flex items-center gap-2 font-medium">
                {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                {service.name} ({groupSubservices.length})
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary capitalize">
                  {service.gender_tag}
                </span>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <form action={submitDeleteCategory}>
                  <input type="hidden" name="id" value={service.id} />
                  <Button type="submit" variant="ghost" size="sm" className="h-8 text-destructive">
                    Delete Group
                  </Button>
                </form>
              </div>
            </div>

            {isExpanded && (
              <CardContent className="border-t p-4 pt-4">
                {groupSubservices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subservices added yet.</p>
                ) : (
                  <div className="space-y-4">
                    {groupSubservices.map((sub) => (
                      <SubserviceRow key={sub.id} subservice={sub} services={services} showExtraCategory={showExtraCategory} />
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {services.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No service groups created yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SubserviceRow({
  subservice,
  services,
  showExtraCategory,
}: {
  subservice: Subservice;
  services: ServiceGroup[];
  showExtraCategory: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <div className="font-medium">
            {subservice.name}
            {subservice.tier && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary capitalize">
                {subservice.tier}
              </span>
            )}
            {subservice.extra_category && (
              <span className="ml-2 rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300 capitalize">
                {subservice.extra_category}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {subservice.duration_minutes} min • ₹{subservice.price.toFixed(2)} • {subservice.gender_tag} •{" "}
            {subservice.is_active ? "Active" : "Inactive"}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          <Edit2 className="mr-2 h-4 w-4" /> Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <form
        action={(data) => {
          submitUpdateService(data);
          setIsEditing(false);
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="id" value={subservice.id} />
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input name="name" defaultValue={subservice.name} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duration (min)</Label>
          <Input
            name="duration_minutes"
            type="number"
            step={5}
            min={5}
            defaultValue={subservice.duration_minutes}
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Price (₹)</Label>
          <Input
            name="price"
            type="number"
            step="0.01"
            min={0}
            defaultValue={subservice.price}
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Service Group</Label>
          <select
            name="service_id"
            defaultValue={subservice.service_id ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">None</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Gender</Label>
          <select
            name="gender_tag"
            defaultValue={subservice.gender_tag}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="unisex">Unisex</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tier</Label>
          <select
            name="tier"
            defaultValue={subservice.tier ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">None</option>
            <option value="basic">Basic</option>
            <option value="medium">Medium</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        {showExtraCategory && (
          <div className="space-y-1">
            <Label className="text-xs">Extra Category</Label>
            <Input
              name="extra_category"
              defaultValue={subservice.extra_category ?? ""}
              placeholder="e.g. Luxury, Express"
            />
          </div>
        )}
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            name="is_active"
            value="true"
            defaultChecked={subservice.is_active}
            id={`act-${subservice.id}`}
            className="h-4 w-4 rounded border"
          />
          <Label htmlFor={`act-${subservice.id}`} className="text-sm font-normal">
            Active
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-4 lg:col-span-2">
          <Button type="submit" size="sm">
            Save Changes
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive"
            onClick={(e) => {
              const form = e.currentTarget.closest("form")?.nextElementSibling as HTMLFormElement;
              if (form) form.requestSubmit();
            }}
          >
            Delete
          </Button>
        </div>
      </form>
      <form action={submitDeleteService} className="hidden">
        <input type="hidden" name="id" value={subservice.id} />
      </form>
    </div>
  );
}
