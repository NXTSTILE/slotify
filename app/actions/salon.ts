"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMinutes } from "date-fns";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assignStaff } from "@/lib/booking/staffAssignment";

/**
 * Secures dashboard actions by verifying user session and fetching their active salon.
 */
async function requireSalon() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  
  const result = await db.query(
    "SELECT * FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
    [session.userId]
  );
  
  const salon = result.rows[0];
  if (!salon) {
    throw new Error("Salon not found");
  }
  return { salon };
}

const salonInfoSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  address: z.string().optional(),
  city: z.string().optional(),
  cancellation_policy: z.string().optional(),
  services_display_mode: z.enum(["flat", "grouped"]),
});

export async function updateSalonInfoAction(formData: FormData) {
  const parsed = salonInfoSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    cancellation_policy: formData.get("cancellation_policy") || undefined,
    services_display_mode: formData.get("services_display_mode"),
  });
  if (!parsed.success) {
    return { error: "Invalid salon info." };
  }
  try {
    const { salon } = await requireSalon();
    const { name, phone, address, city, cancellation_policy, services_display_mode } = parsed.data;
    
    await db.query(
      `UPDATE public.salons 
       SET name = $1, phone = $2, address = $3, city = $4, cancellation_policy = $5, services_display_mode = $6 
       WHERE id = $7`,
      [name, phone, address ?? null, city ?? null, cancellation_policy ?? null, services_display_mode, salon.id]
    );

    revalidatePath("/dashboard/settings");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

const waSchema = z.object({
  whatsapp_phone_number_id: z.string().optional(),
  whatsapp_access_token: z.string().optional(),
  whatsapp_business_account_id: z.string().optional(),
});

export async function updateWhatsAppAction(formData: FormData) {
  const phoneId = formData.get("whatsapp_phone_number_id") as string | null;
  const businessId = formData.get("whatsapp_business_account_id") as string | null;
  const accessToken = formData.get("whatsapp_access_token") as string | null;

  try {
    const { salon } = await requireSalon();

    const cleanPhoneId = phoneId && phoneId.trim() !== "" ? phoneId.trim() : null;
    const cleanBusinessId = businessId && businessId.trim() !== "" ? businessId.trim() : null;
    const cleanAccessToken = accessToken && accessToken.trim() !== "" ? accessToken.trim() : null;

    if (cleanAccessToken) {
      await db.query(
        `UPDATE public.salons 
         SET whatsapp_phone_number_id = $1, 
             whatsapp_access_token = $2, 
             whatsapp_business_account_id = $3 
         WHERE id = $4`,
        [cleanPhoneId, cleanAccessToken, cleanBusinessId, salon.id]
      );
    } else {
      await db.query(
        `UPDATE public.salons 
         SET whatsapp_phone_number_id = $1, 
             whatsapp_business_account_id = $2 
         WHERE id = $3`,
        [cleanPhoneId, cleanBusinessId, salon.id]
      );
    }

    revalidatePath("/dashboard/settings");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

const hoursSchema = z.object({
  day_of_week: z.coerce.number().min(0).max(6),
  open_time: z.string().optional(),
  close_time: z.string().optional(),
  is_closed: z.coerce.boolean(),
});

export async function upsertWorkingHourAction(formData: FormData) {
  const parsed = hoursSchema.safeParse({
    day_of_week: formData.get("day_of_week"),
    open_time: formData.get("open_time") || undefined,
    close_time: formData.get("close_time") || undefined,
    is_closed: formData.get("is_closed") === "on" || formData.get("is_closed") === "true",
  });
  if (!parsed.success) {
    return { error: "Invalid hours." };
  }
  try {
    const { salon } = await requireSalon();
    const { day_of_week, open_time, close_time, is_closed } = parsed.data;

    await db.query(
      `INSERT INTO public.working_hours (salon_id, day_of_week, open_time, close_time, is_closed) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (salon_id, day_of_week) 
       DO UPDATE SET open_time = $3, close_time = $4, is_closed = $5`,
      [
        salon.id,
        day_of_week,
        is_closed ? null : open_time ?? null,
        is_closed ? null : close_time ?? null,
        is_closed
      ]
    );

    revalidatePath("/dashboard/settings");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
});

export async function addHolidayAction(formData: FormData) {
  const parsed = holidaySchema.safeParse({
    date: formData.get("date"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid date." };
  }
  try {
    const { salon } = await requireSalon();
    await db.query(
      "INSERT INTO public.holidays (salon_id, date, reason) VALUES ($1, $2, $3)",
      [salon.id, parsed.data.date, parsed.data.reason ?? null]
    );

    revalidatePath("/dashboard/settings");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteHolidayAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { error: "Missing id." };
  }
  try {
    const { salon } = await requireSalon();
    await db.query(
      "DELETE FROM public.holidays WHERE id = $1 AND salon_id = $2",
      [id, salon.id]
    );

    revalidatePath("/dashboard/settings");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export type SettingsFormState = { error?: string };

export async function updateSalonProfileFormAction(
  _prev: SettingsFormState | undefined,
  formData: FormData
): Promise<SettingsFormState> {
  const r = await updateSalonInfoAction(formData);
  if ("error" in r) return { error: r.error };
  return {};
}

export async function updateWhatsAppConnectionFormAction(
  _prev: SettingsFormState | undefined,
  formData: FormData
): Promise<SettingsFormState> {
  const r = await updateWhatsAppAction(formData);
  if ("error" in r) return { error: r.error };
  return {};
}

export async function upsertWorkingHourFormAction(
  _prev: SettingsFormState | undefined,
  formData: FormData
): Promise<SettingsFormState> {
  const r = await upsertWorkingHourAction(formData);
  if ("error" in r) return { error: r.error };
  return {};
}

export async function addHolidayFormAction(
  _prev: SettingsFormState | undefined,
  formData: FormData
): Promise<SettingsFormState> {
  const r = await addHolidayAction(formData);
  if ("error" in r) return { error: r.error };
  return {};
}

export async function deleteHolidayFormAction(
  _prev: SettingsFormState | undefined,
  formData: FormData
): Promise<SettingsFormState> {
  const r = await deleteHolidayAction(formData);
  if ("error" in r) return { error: r.error };
  return {};
}

const categorySchema = z.object({
  name: z.string().min(1),
});

export async function addCategoryAction(formData: FormData) {
  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Category name required." };
  }
  try {
    const { salon } = await requireSalon();
    
    // Calculate display order sequence
    const countRes = await db.query(
      "SELECT COUNT(*) as count FROM public.service_categories WHERE salon_id = $1",
      [salon.id]
    );
    const count = Number(countRes.rows[0].count);

    await db.query(
      "INSERT INTO public.service_categories (salon_id, name, display_order) VALUES ($1, $2, $3)",
      [salon.id, parsed.data.name, count + 1]
    );

    revalidatePath("/dashboard/services");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

const serviceSchema = z.object({
  name: z.string().min(1),
  duration_minutes: z.coerce.number().refine((n) => n > 0 && n % 5 === 0),
  price: z.coerce.number().nonnegative(),
  category_id: z.string().uuid().nullable().optional(),
  is_active: z.coerce.boolean().optional(),
});

export async function addServiceAction(formData: FormData) {
  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    duration_minutes: formData.get("duration_minutes"),
    price: formData.get("price"),
    category_id: formData.get("category_id") || null,
    is_active: formData.get("is_active") === "true" || formData.get("is_active") === "on",
  });
  if (!parsed.success) {
    return { error: "Duration must be a multiple of 5; check price." };
  }
  try {
    const { salon } = await requireSalon();
    
    const countRes = await db.query(
      "SELECT COUNT(*) as count FROM public.services WHERE salon_id = $1",
      [salon.id]
    );
    const count = Number(countRes.rows[0].count);

    await db.query(
      `INSERT INTO public.services (salon_id, name, duration_minutes, price, category_id, is_active, display_order) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        salon.id,
        parsed.data.name,
        parsed.data.duration_minutes,
        parsed.data.price,
        parsed.data.category_id ?? null,
        parsed.data.is_active ?? true,
        count + 1
      ]
    );

    revalidatePath("/dashboard/services");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateServiceAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { error: "Missing service id." };
  }
  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    duration_minutes: formData.get("duration_minutes"),
    price: formData.get("price"),
    category_id: formData.get("category_id") || null,
    is_active: formData.get("is_active") === "true" || formData.get("is_active") === "on",
  });
  if (!parsed.success) {
    return { error: "Invalid service fields." };
  }
  try {
    const { salon } = await requireSalon();
    await db.query(
      `UPDATE public.services 
       SET name = $1, duration_minutes = $2, price = $3, category_id = $4, is_active = $5 
       WHERE id = $6 AND salon_id = $7`,
      [
        parsed.data.name,
        parsed.data.duration_minutes,
        parsed.data.price,
        parsed.data.category_id ?? null,
        parsed.data.is_active ?? true,
        id,
        salon.id
      ]
    );

    revalidatePath("/dashboard/services");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteServiceAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { error: "Missing id." };
  }
  try {
    const { salon } = await requireSalon();
    await db.query(
      "DELETE FROM public.services WHERE id = $1 AND salon_id = $2",
      [id, salon.id]
    );

    revalidatePath("/dashboard/services");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function reorderServicesAction(order: string[]) {
  const ids = z.array(z.string().uuid()).safeParse(order);
  if (!ids.success) {
    return { error: "Invalid order payload." };
  }
  try {
    const { salon } = await requireSalon();
    
    // Batch update displays
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < ids.data.length; i++) {
        await client.query(
          "UPDATE public.services SET display_order = $1 WHERE id = $2 AND salon_id = $3",
          [i + 1, ids.data[i], salon.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    revalidatePath("/dashboard/services");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function reorderCategoriesAction(order: string[]) {
  const ids = z.array(z.string().uuid()).safeParse(order);
  if (!ids.success) {
    return { error: "Invalid order payload." };
  }
  try {
    const { salon } = await requireSalon();
    
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < ids.data.length; i++) {
        await client.query(
          "UPDATE public.service_categories SET display_order = $1 WHERE id = $2 AND salon_id = $3",
          [i + 1, ids.data[i], salon.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    revalidatePath("/dashboard/services");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteCategoryAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { error: "Missing id." };
  }
  try {
    const { salon } = await requireSalon();
    await db.query(
      "DELETE FROM public.service_categories WHERE id = $1 AND salon_id = $2",
      [id, salon.id]
    );

    revalidatePath("/dashboard/services");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function submitAddCategory(formData: FormData): Promise<void> {
  await addCategoryAction(formData);
}

export async function submitAddService(formData: FormData): Promise<void> {
  await addServiceAction(formData);
}

export async function submitDeleteCategory(formData: FormData): Promise<void> {
  await deleteCategoryAction(formData);
}

export async function submitUpdateService(formData: FormData): Promise<void> {
  await updateServiceAction(formData);
}

export async function submitDeleteService(formData: FormData): Promise<void> {
  await deleteServiceAction(formData);
}

const appointmentUpdateSchema = z.object({
  status: z.enum(["completed", "cancelled"]),
  reason: z.string().optional(),
});

export async function updateAppointmentStatusAction(formData: FormData): Promise<void> {
  const parsed = appointmentUpdateSchema.safeParse({
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  const id = formData.get("id");
  if (typeof id !== "string" || !parsed.success) {
    console.error("[updateAppointmentStatusAction] invalid input");
    return;
  }
  try {
    const { salon } = await requireSalon();
    await db.query(
      "UPDATE public.appointments SET status = $1 WHERE id = $2 AND salon_id = $3",
      [parsed.data.status, id, salon.id]
    );

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/appointments");
  } catch (e) {
    console.error("[updateAppointmentStatusAction]", e);
  }
}

export async function markNotificationsReadAction(): Promise<void> {
  try {
    const { salon } = await requireSalon();
    await db.query(
      "UPDATE public.notifications SET is_read = true WHERE salon_id = $1 AND is_read = false",
      [salon.id]
    );
    revalidatePath("/dashboard");
  } catch (e) {
    console.error("[markNotificationsReadAction]", e);
  }
}

export async function addWalkInBookingAction(formData: FormData) {
  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const serviceIds = JSON.parse(formData.get("serviceIds") as string) as string[];

  const client = await db.pool.connect();

  try {
    const { salon } = await requireSalon();

    await client.query("BEGIN");

    // 1. Upsert Customer
    const existing = await client.query(
      "SELECT id FROM public.customers WHERE salon_id = $1 AND phone = $2 LIMIT 1",
      [salon.id, phone]
    );
    let customerId = "";
    if (existing.rows.length > 0) {
      customerId = existing.rows[0].id;
      await client.query(
        "UPDATE public.customers SET name = $1 WHERE id = $2",
        [name, customerId]
      );
    } else {
      const created = await client.query(
        "INSERT INTO public.customers (salon_id, phone, name) VALUES ($1, $2, $3) RETURNING id",
        [salon.id, phone, name]
      );
      customerId = created.rows[0].id;
    }

    // 2. Fetch selected services details
    const svcRes = await client.query(
      "SELECT id, price, duration_minutes FROM public.services WHERE id = ANY($1::uuid[])",
      [serviceIds]
    );
    const dbServices = svcRes.rows;

    if (!dbServices || dbServices.length === 0) {
      client.release();
      return { error: "No services found." };
    }

    // 3. Compute total duration and price
    const totalDuration = dbServices.reduce((sum, s) => sum + s.duration_minutes, 0);
    const totalPrice = dbServices.reduce((sum, s) => sum + Number(s.price), 0);

    // 4a. Smart staff assignment — each staff member is checked independently.
    //     requestedStart = NOW so each staff's earliest free slot from this moment is found.
    //     If staff B is free from 9:00 AM and staff A is busy until 10:00, staff B gets 9:00.
    const staffResult = await assignStaff(
      salon.id,
      serviceIds,
      addMinutes(new Date(), 2), // use a fresh "now" for the initial search window
      totalDuration
    );

    // Re-sample "now" RIGHT HERE — after all async DB work — so the stored start_time
    // is never stale from before assignStaff's round-trips completed.
    const now = new Date();
    const requestedStart = addMinutes(now, 2); // 2-min grace for walk-in

    // If staff found, use their computed available start; otherwise queue after the salon's latest end
    let startTime: Date;
    const staffId = staffResult?.staffId ?? null;

    if (staffResult) {
      // Use staff's own next available slot, but ensure it's not in the past
      // (re-anchor to fresh now if assignStaff took long enough to make it stale)
      startTime = staffResult.assignedStartUtc < requestedStart
        ? requestedStart
        : staffResult.assignedStartUtc;
    } else {
      // No staff configured — fall back to salon-level queue
      const lastAptRes = await client.query(
        `SELECT end_time FROM public.appointments 
         WHERE salon_id = $1 AND status IN ('pending', 'confirmed')
         AND end_time > NOW()
         ORDER BY end_time DESC LIMIT 1`,
        [salon.id]
      );
      const lastApt = lastAptRes.rows[0];
      startTime = requestedStart;
      if (lastApt && new Date(lastApt.end_time) > now) {
        startTime = addMinutes(new Date(lastApt.end_time), 2);
      }
    }

    const endTime = addMinutes(startTime, totalDuration);

    // 4b. Insert Appointment
    const aptInsert = await client.query(
      `INSERT INTO public.appointments 
       (salon_id, customer_id, start_time, end_time, total_duration_minutes, total_price, status, staff_id) 
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7) RETURNING id`,
      [salon.id, customerId, startTime.toISOString(), endTime.toISOString(), totalDuration, totalPrice, staffId]
    );
    const appointmentId = aptInsert.rows[0].id;

    // 5. Insert Appointment Services relation
    for (const service of dbServices) {
      await client.query(
        `INSERT INTO public.appointment_services (appointment_id, service_id, price_at_booking, duration_at_booking) 
         VALUES ($1, $2, $3, $4)`,
        [appointmentId, service.id, Number(service.price), service.duration_minutes]
      );
    }

    await client.query("COMMIT");
    client.release();

    revalidatePath("/dashboard");
    return { ok: true as const, startTime: startTime.toISOString() };

  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    client.release();
    console.error("[addWalkInBookingAction] error:", e);
    return { error: "Failed to add walk-in." };
  }
}
