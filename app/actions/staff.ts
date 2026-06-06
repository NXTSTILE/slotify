"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function requireSalon() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await db.query(
    "SELECT * FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  const salon = result.rows[0];
  if (!salon) throw new Error("Salon not found");
  return { salon };
}

const staffSchema = z.object({
  name: z.string().min(1, "Name is required"),
  serviceIds: z.array(z.string().uuid()).min(1, "Select at least one service"),
});

/** Add a new staff member and their service specializations. */
export async function addStaffAction(formData: FormData) {
  const raw = {
    name: formData.get("name"),
    serviceIds: JSON.parse((formData.get("serviceIds") as string) || "[]"),
  };
  const parsed = staffSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const { salon } = await requireSalon();
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const staffInsert = await client.query(
        "INSERT INTO public.staff (salon_id, name) VALUES ($1, $2) RETURNING id",
        [salon.id, parsed.data.name]
      );
      const staffId = staffInsert.rows[0].id as string;

      for (const svcId of parsed.data.serviceIds) {
        await client.query(
          "INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [staffId, svcId]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    revalidatePath("/dashboard/staff");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add staff." };
  }
}

const updateStaffSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  serviceIds: z.array(z.string().uuid()).min(1, "Select at least one service"),
});

/** Update a staff member's name and replace their service list. */
export async function updateStaffAction(formData: FormData) {
  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    serviceIds: JSON.parse((formData.get("serviceIds") as string) || "[]"),
  };
  const parsed = updateStaffSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const { salon } = await requireSalon();
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // Verify staff belongs to this salon
      const check = await client.query(
        "SELECT id FROM public.staff WHERE id = $1 AND salon_id = $2 LIMIT 1",
        [parsed.data.id, salon.id]
      );
      if (!check.rows.length) throw new Error("Staff not found");

      await client.query(
        "UPDATE public.staff SET name = $1 WHERE id = $2",
        [parsed.data.name, parsed.data.id]
      );

      // Replace service list
      await client.query("DELETE FROM public.staff_services WHERE staff_id = $1", [
        parsed.data.id,
      ]);
      for (const svcId of parsed.data.serviceIds) {
        await client.query(
          "INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [parsed.data.id, svcId]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    revalidatePath("/dashboard/staff");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update staff." };
  }
}

/** Toggle the active status of a staff member. */
export async function toggleStaffActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("is_active") === "true";
  if (!id) return { error: "Missing id." };

  try {
    const { salon } = await requireSalon();
    await db.query(
      "UPDATE public.staff SET is_active = $1 WHERE id = $2 AND salon_id = $3",
      [active, id, salon.id]
    );
    revalidatePath("/dashboard/staff");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed." };
  }
}

/** Delete a staff member (appointments retain staff_id=NULL after SET NULL FK). */
export async function deleteStaffAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return { error: "Missing id." };

  try {
    const { salon } = await requireSalon();
    await db.query(
      "DELETE FROM public.staff WHERE id = $1 AND salon_id = $2",
      [id, salon.id]
    );
    revalidatePath("/dashboard/staff");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete staff." };
  }
}

/** Load all staff with their service names for a salon (server component helper). */
export async function getStaffWithServices(salonId: string) {
  const res = await db.query(
    `SELECT s.id, s.name, s.is_active,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT('id', svc.id, 'name', svc.name)
                ORDER BY svc.name
              ) FILTER (WHERE svc.id IS NOT NULL),
              '[]'
            ) AS services
     FROM public.staff s
     LEFT JOIN public.staff_services ss ON ss.staff_id = s.id
     LEFT JOIN public.services svc ON svc.id = ss.service_id
     WHERE s.salon_id = $1
     GROUP BY s.id, s.name, s.is_active
     ORDER BY s.name ASC`,
    [salonId]
  );
  return res.rows as Array<{
    id: string;
    name: string;
    is_active: boolean;
    services: Array<{ id: string; name: string }>;
  }>;
}
