"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import {
  reorderServicesAction,
  submitDeleteService,
  submitUpdateService,
} from "@/app/actions/salon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GripVertical } from "lucide-react";

type Svc = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  category_id: string | null;
  is_active: boolean;
  gender_tag: string;
};

export function ServicesReorder({
  categories,
  services,
}: {
  categories: { id: string; name: string }[];
  services: Svc[];
}) {
  const [items, setItems] = useState(services);
  useEffect(() => {
    setItems(services);
  }, [services]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    const res = await reorderServicesAction(next.map((s) => s.id));
    if (res?.error) {
      console.error(res.error);
      setItems(services);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your services (drag to reorder)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {items.map((s) => (
              <SortableRow key={s.id} id={s.id} categories={categories} service={s} />
            ))}
          </CardContent>
        </Card>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  categories,
  service,
}: {
  id: string;
  categories: { id: string; name: string }[];
  service: Svc;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border p-4">
      <div className="mb-3 flex items-start gap-2">
        <button
          type="button"
          className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 space-y-3">
          <form action={submitUpdateService} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="id" value={service.id} />
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input name="name" defaultValue={service.name} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Duration</Label>
              <Input
                name="duration_minutes"
                type="number"
                step={5}
                min={5}
                defaultValue={service.duration_minutes}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Price</Label>
              <Input
                name="price"
                type="number"
                step="0.01"
                min={0}
                defaultValue={service.price}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select
                name="category_id"
                defaultValue={service.category_id ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <select
                name="gender_tag"
                defaultValue={service.gender_tag}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="unisex">Unisex</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                name="is_active"
                value="true"
                defaultChecked={service.is_active}
                id={`act-${service.id}`}
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor={`act-${service.id}`} className="text-sm font-normal">
                Active
              </Label>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </form>
          <form action={submitDeleteService} className="inline">
            <input type="hidden" name="id" value={service.id} />
            <Button type="submit" variant="ghost" size="sm" className="text-destructive">
              Delete
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
