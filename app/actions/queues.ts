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

const queueSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

/** Add a new queue. */
export async function addQueueAction(formData: FormData) {
  const parsed = queueSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const { salon } = await requireSalon();
    await db.query(
      "INSERT INTO public.queues (salon_id, name) VALUES ($1, $2)",
      [salon.id, parsed.data.name]
    );
    revalidatePath("/dashboard/queues");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add queue." };
  }
}

const updateQueueSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
});

/** Rename a queue. */
export async function updateQueueAction(formData: FormData) {
  const parsed = updateQueueSchema.safeParse({ id: formData.get("id"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const { salon } = await requireSalon();
    await db.query(
      "UPDATE public.queues SET name = $1 WHERE id = $2 AND salon_id = $3",
      [parsed.data.name, parsed.data.id, salon.id]
    );
    revalidatePath("/dashboard/queues");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update queue." };
  }
}

/** Toggle queue active/inactive. */
export async function toggleQueueActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("is_active") === "true";
  if (!id) return { error: "Missing id." };

  try {
    const { salon } = await requireSalon();
    await db.query(
      "UPDATE public.queues SET is_active = $1 WHERE id = $2 AND salon_id = $3",
      [active, id, salon.id]
    );
    revalidatePath("/dashboard/queues");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed." };
  }
}

/** Delete a queue. */
export async function deleteQueueAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return { error: "Missing id." };

  try {
    const { salon } = await requireSalon();
    await db.query("DELETE FROM public.queues WHERE id = $1 AND salon_id = $2", [id, salon.id]);
    revalidatePath("/dashboard/queues");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete queue." };
  }
}

/** Load all queues for a salon. */
export async function getQueues(salonId: string) {
  const res = await db.query(
    "SELECT id, name, is_active FROM public.queues WHERE salon_id = $1 ORDER BY name ASC",
    [salonId]
  );
  return res.rows as Array<{ id: string; name: string; is_active: boolean }>;
}

/** Cancel an appointment from the dashboard and queue WhatsApp notification. */
export async function cancelAppointmentAction(formData: FormData) {
  const id = formData.get("id") as string;
  const reason = formData.get("reason") as string | null;
  if (!id) return { error: "Missing appointment id." };

  try {
    const { salon } = await requireSalon();
    
    // Fetch last message time from conversation state or fallback to appointment created_at
    const lastMsgRes = await db.query(
      `SELECT cs.updated_at as last_customer_message_at, a.created_at
       FROM public.appointments a
       JOIN public.customers c ON c.id = a.customer_id
       LEFT JOIN public.conversation_states cs ON cs.customer_phone = c.phone AND cs.salon_id = a.salon_id
       WHERE a.id = $1 AND a.salon_id = $2`,
      [id, salon.id]
    );
    if (!lastMsgRes.rows.length) return { error: "Appointment not found." };
    const dateRow = lastMsgRes.rows[0];
    const lastMsgTime = dateRow.last_customer_message_at ? new Date(dateRow.last_customer_message_at) : new Date(dateRow.created_at);
    const diffHours = (Date.now() - lastMsgTime.getTime()) / (1000 * 60 * 60);
    if (diffHours > 12) {
      return { error: "Rescheduling and cancellation can only be done within 12 hours after the customer's last message." };
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE public.appointments SET status = 'cancelled', cancellation_reason = $1 WHERE id = $2 AND salon_id = $3",
        [reason?.trim() || null, id, salon.id]
      );
      await client.query(
        "INSERT INTO public.notifications (salon_id, type, appointment_id, is_read, whatsapp_sent) VALUES ($1, 'cancellation', $2, false, false)",
        [salon.id, id]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    revalidatePath("/dashboard/appointments");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to cancel appointment." };
  }
}

/** Reschedule an appointment to a different queue and queue WhatsApp notification. */
export async function rescheduleAppointmentAction(formData: FormData) {
  const id = formData.get("id") as string;
  const queueId = formData.get("queue_id") as string;
  if (!id) return { error: "Missing appointment id." };

  try {
    const { salon } = await requireSalon();

    // Fetch last message time from conversation state or fallback to appointment created_at
    const lastMsgRes = await db.query(
      `SELECT cs.updated_at as last_customer_message_at, a.created_at
       FROM public.appointments a
       JOIN public.customers c ON c.id = a.customer_id
       LEFT JOIN public.conversation_states cs ON cs.customer_phone = c.phone AND cs.salon_id = a.salon_id
       WHERE a.id = $1 AND a.salon_id = $2`,
      [id, salon.id]
    );
    if (!lastMsgRes.rows.length) return { error: "Appointment not found." };
    const dateRow = lastMsgRes.rows[0];
    const lastMsgTime = dateRow.last_customer_message_at ? new Date(dateRow.last_customer_message_at) : new Date(dateRow.created_at);
    const diffHours = (Date.now() - lastMsgTime.getTime()) / (1000 * 60 * 60);
    if (diffHours > 12) {
      return { error: "Rescheduling and cancellation can only be done within 12 hours after the customer's last message." };
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE public.appointments SET queue_id = $1 WHERE id = $2 AND salon_id = $3",
        [queueId || null, id, salon.id]
      );
      await client.query(
        "INSERT INTO public.notifications (salon_id, type, appointment_id, is_read, whatsapp_sent) VALUES ($1, 'reschedule', $2, false, false)",
        [salon.id, id]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    revalidatePath("/dashboard/appointments");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reschedule." };
  }
}
