"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import type { Database } from "@/lib/types/database";
import { z } from "zod";
import { addMinutes } from "date-fns";

type SalonUpdate = Database["public"]["Tables"]["salons"]["Update"];

async function requireSalon() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  const { salon, error } = await getSalonForUser(supabase, user.id);
  if (error || !salon) {
    throw new Error("Salon not found");
  }
  return { supabase, salon };
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
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase
      .from("salons")
      .update(parsed.data)
      .eq("id", salon.id);
    if (error) {
      return { error: error.message };
    }
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
  const parsed = waSchema.safeParse({
    whatsapp_phone_number_id: formData.get("whatsapp_phone_number_id") || undefined,
    whatsapp_access_token: formData.get("whatsapp_access_token") || undefined,
    whatsapp_business_account_id: formData.get("whatsapp_business_account_id") || undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid WhatsApp fields." };
  }
  try {
    const { supabase, salon } = await requireSalon();
    const patch: SalonUpdate = {};
    if (parsed.data.whatsapp_phone_number_id !== undefined) {
      patch.whatsapp_phone_number_id = parsed.data.whatsapp_phone_number_id || null;
    }
    if (parsed.data.whatsapp_access_token !== undefined) {
      patch.whatsapp_access_token = parsed.data.whatsapp_access_token || null;
    }
    if (parsed.data.whatsapp_business_account_id !== undefined) {
      patch.whatsapp_business_account_id = parsed.data.whatsapp_business_account_id || null;
    }
    const { error } = await supabase.from("salons").update(patch).eq("id", salon.id);
    if (error) {
      return { error: error.message };
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
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase.from("working_hours").upsert(
      {
        salon_id: salon.id,
        day_of_week: parsed.data.day_of_week,
        open_time: parsed.data.is_closed ? null : parsed.data.open_time ?? null,
        close_time: parsed.data.is_closed ? null : parsed.data.close_time ?? null,
        is_closed: parsed.data.is_closed,
      },
      { onConflict: "salon_id,day_of_week" }
    );
    if (error) {
      return { error: error.message };
    }
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
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase.from("holidays").insert({
      salon_id: salon.id,
      date: parsed.data.date,
      reason: parsed.data.reason ?? null,
    });
    if (error) {
      return { error: error.message };
    }
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
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase
      .from("holidays")
      .delete()
      .eq("id", id)
      .eq("salon_id", salon.id);
    if (error) {
      return { error: error.message };
    }
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
    const { supabase, salon } = await requireSalon();
    const { count } = await supabase
      .from("service_categories")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salon.id);
    const { error } = await supabase.from("service_categories").insert({
      salon_id: salon.id,
      name: parsed.data.name,
      display_order: (count ?? 0) + 1,
    });
    if (error) {
      return { error: error.message };
    }
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
    is_active: formData.get("is_active") === "true",
  });
  if (!parsed.success) {
    return { error: "Duration must be a multiple of 5; check price." };
  }
  try {
    const { supabase, salon } = await requireSalon();
    const { count } = await supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salon.id);
    const { error } = await supabase.from("services").insert({
      salon_id: salon.id,
      name: parsed.data.name,
      duration_minutes: parsed.data.duration_minutes,
      price: parsed.data.price,
      category_id: parsed.data.category_id ?? null,
      is_active: parsed.data.is_active,
      display_order: (count ?? 0) + 1,
    });
    if (error) {
      return { error: error.message };
    }
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
    is_active: formData.get("is_active") === "true",
  });
  if (!parsed.success) {
    return { error: "Invalid service fields." };
  }
  try {
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase
      .from("services")
      .update({
        name: parsed.data.name,
        duration_minutes: parsed.data.duration_minutes,
        price: parsed.data.price,
        category_id: parsed.data.category_id ?? null,
        is_active: parsed.data.is_active,
      })
      .eq("id", id)
      .eq("salon_id", salon.id);
    if (error) {
      return { error: error.message };
    }
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
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", id)
      .eq("salon_id", salon.id);
    if (error) {
      return { error: error.message };
    }
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
    const { supabase, salon } = await requireSalon();
    for (let i = 0; i < ids.data.length; i++) {
      const { error } = await supabase
        .from("services")
        .update({ display_order: i + 1 })
        .eq("id", ids.data[i])
        .eq("salon_id", salon.id);
      if (error) {
        return { error: error.message };
      }
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
    const { supabase, salon } = await requireSalon();
    for (let i = 0; i < ids.data.length; i++) {
      const { error } = await supabase
        .from("service_categories")
        .update({ display_order: i + 1 })
        .eq("id", ids.data[i])
        .eq("salon_id", salon.id);
      if (error) {
        return { error: error.message };
      }
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
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase
      .from("service_categories")
      .delete()
      .eq("id", id)
      .eq("salon_id", salon.id);
    if (error) {
      return { error: error.message };
    }
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
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase
      .from("appointments")
      .update({ status: parsed.data.status })
      .eq("id", id)
      .eq("salon_id", salon.id);
    if (error) {
      console.error("[updateAppointmentStatusAction]", error.message);
      return;
    }
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/appointments");
  } catch (e) {
    console.error("[updateAppointmentStatusAction]", e);
  }
}

export async function markNotificationsReadAction(_formData?: FormData): Promise<void> {
  try {
    const { supabase, salon } = await requireSalon();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("salon_id", salon.id)
      .eq("is_read", false);
    if (error) {
      console.error("[markNotificationsReadAction]", error.message);
      return;
    }
    revalidatePath("/dashboard");
  } catch (e) {
    console.error("[markNotificationsReadAction]", e);
  }
}

export async function addWalkInBookingAction(formData: FormData) {
  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const serviceIds = JSON.parse(formData.get("serviceIds") as string) as string[];

  try {
    const { supabase, salon } = await requireSalon();

    const { data: customer } = await supabase
      .from("customers")
      .upsert({ salon_id: salon.id, name, phone }, { onConflict: "salon_id,phone" })
      .select("id")
      .single();

    const { data: dbServices } = await supabase
      .from("services")
      .select("id, price, duration_minutes")
      .in("id", serviceIds);

    if (!dbServices || dbServices.length === 0) {
      return { error: "No services found." };
    }

    const { data: lastApt } = await supabase
      .from("appointments")
      .select("end_time")
      .eq("salon_id", salon.id)
      .gte("start_time", new Date().toISOString())
      .in("status", ["pending", "confirmed"])
      .order("end_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    let startTime = addMinutes(now, 2); 
    
    if (lastApt && new Date(lastApt.end_time) > now) {
      startTime = addMinutes(new Date(lastApt.end_time), 2);
    }

    const totalDuration = dbServices.reduce((sum, s) => sum + s.duration_minutes, 0);
    const totalPrice = dbServices.reduce((sum, s) => sum + s.price, 0);
    const endTime = addMinutes(startTime, totalDuration);

    const { data: apt, error: aptErr } = await supabase
      .from("appointments")
      .insert({
        salon_id: salon.id,
        customer_id: customer!.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        total_duration_minutes: totalDuration,
        total_price: totalPrice,
        status: "confirmed"
      })
      .select("id")
      .single();

    if (aptErr) throw aptErr;

    for (const service of dbServices) {
      await supabase.from("appointment_services").insert({
        appointment_id: apt.id,
        service_id: service.id,
        price_at_booking: service.price,
        duration_at_booking: service.duration_minutes
      });
    }

    revalidatePath("/dashboard");
    return { ok: true as const, startTime: startTime.toISOString() };

  } catch (e) {
    console.error("[addWalkInBookingAction] error:", e);
    return { error: "Failed to add walk-in." };
  }
}
