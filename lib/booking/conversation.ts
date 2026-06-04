import { addMinutes, format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { z } from "zod";
import {
  APPOINTMENT_BUFFER_MINUTES,
  CUSTOMER_TRAVEL_BUFFER_MINUTES,
  SALON_TIMEZONE,
} from "@/lib/constants";
import { normalizeCustomerPhone } from "@/lib/booking/phone";
import { db } from "@/lib/db";
import {
  getAvailableWindows,
  parseDdMmYyyyKolkata,
} from "@/lib/booking/slots";
import { assignStaff } from "@/lib/booking/staffAssignment";
import {
  sendWhatsAppText,
  sendWhatsAppList,
  sendWhatsAppButtons,
} from "@/lib/whatsapp/send";

/** How many minutes a pending "frozen" slot lasts before it expires and is released */
const SLOT_FREEZE_TIMEOUT_MINUTES = 5;

const CtxSchema = z.object({
  serviceIds: z.array(z.string().uuid()).optional(),
  selectedDayIso: z.string().optional(),
  selectedSession: z.string().optional(), // "morning" | "evening"
  gender: z.enum(["male", "female"]).optional(), // selected by customer at greeting
  slotStarts: z.array(z.string()).optional(),
  selectedSlotIndex: z.number().int().optional(),
  pendingCancelAppointmentId: z.string().uuid().optional(),
  pendingReschedule: z.boolean().optional(),
  lastListMax: z.number().int().optional(),
  frozenAppointmentId: z.string().uuid().optional(), // The pending appointment used to freeze a slot
  // Staff assignment
  assignedStaffId: z.string().uuid().optional(),
  assignedStaffName: z.string().optional(),
});

type Ctx = z.infer<typeof CtxSchema>;

type SalonRow = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  cancellation_policy: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
};

export type IncomingParsed =
  | { kind: "text"; body: string }
  | { kind: "interactive"; id: string; title?: string };

function parseContext(raw: any): Ctx {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const parsed = CtxSchema.safeParse(o);
  return parsed.success ? parsed.data : {};
}

/**
 * Returns true if the given text is a greeting that should reset to the main menu.
 */
function isGreeting(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!.,?]+$/, "");
  return ["hi", "hii", "hiii", "hello", "hey", "helo", "hai", "start"].includes(t);
}

/**
 * Creates or updates the conversation state for a specific customer in the salon.
 */
async function ensureConversationRow(
  salonId: string,
  phone: string,
  state: string,
  ctx: Ctx
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO public.conversation_states (salon_id, customer_phone, state, context, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (salon_id, customer_phone)
       DO UPDATE SET state = $3, context = $4, updated_at = NOW()`,
      [salonId, phone, state, JSON.stringify(ctx)]
    );
  } catch (err: any) {
    console.error("[conversation] upsert state error", err.message);
  }
}

/**
 * Retrieves the active state and context for a customer's WhatsApp conversation.
 */
async function getState(
  salonId: string,
  phone: string
): Promise<{ state: string; ctx: Ctx }> {
  try {
    const res = await db.query(
      "SELECT state, context FROM public.conversation_states WHERE salon_id = $1 AND customer_phone = $2 LIMIT 1",
      [salonId, phone]
    );
    if (res.rows.length === 0) {
      return { state: "IDLE", ctx: {} };
    }
    const row = res.rows[0];
    return { state: row.state, ctx: parseContext(row.context) };
  } catch (err: any) {
    console.error("[conversation] get state error", err.message);
    return { state: "IDLE", ctx: {} };
  }
}

function tokenizeKeywords(text: string): string | null {
  const t = text.trim().toUpperCase();
  const map: Record<string, string> = {
    HELP: "HELP",
    PRICE: "SERVICES",
    SERVICES: "SERVICES",
    LOCATION: "LOCATION",
    HOURS: "HOURS",
    CONTACT: "CONTACT",
    POLICY: "POLICY",
    CANCEL: "CANCEL",
    RESCHEDULE: "RESCHEDULE",
    BOOK: "BOOK",
  };
  return map[t] ?? null;
}

async function sendAuth(
  salon: SalonRow,
  fn: (pid: string, token: string) => Promise<{ ok: boolean; error?: string }>
) {
  const pid = salon.whatsapp_phone_number_id;
  const token = salon.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!pid || !token) {
    console.error("[conversation] Missing WhatsApp credentials for salon", salon.id);
    return;
  }
  await fn(pid, token);
}

/**
 * Locates the active confirmed or pending appointment for a customer.
 */
async function findActiveAppointment(
  salonId: string,
  customerPhone: string
) {
  try {
    const custRes = await db.query(
      "SELECT id FROM public.customers WHERE salon_id = $1 AND phone = $2 LIMIT 1",
      [salonId, customerPhone]
    );
    if (custRes.rows.length === 0) return null;
    const customerId = custRes.rows[0].id;

    const aptRes = await db.query(
      `SELECT id, start_time, status, total_price, total_duration_minutes 
       FROM public.appointments 
       WHERE salon_id = $1 AND customer_id = $2 AND status IN ('pending', 'confirmed') 
       ORDER BY start_time DESC LIMIT 1`,
      [salonId, customerId]
    );
    return aptRes.rows[0] || null;
  } catch (err: any) {
    console.error("[conversation] find active appointment error", err.message);
    return null;
  }
}

/**
 * Releases any frozen (pending) appointment held by this customer that hasn't been confirmed yet.
 * This is called when the customer restarts the flow so the slot is freed for others.
 */
async function releaseFrozenSlot(
  salonId: string,
  customerPhone: string,
  frozenAppointmentId?: string
): Promise<void> {
  if (!frozenAppointmentId) return;
  try {
    // Only delete if it's still pending (not confirmed or cancelled)
    await db.query(
      `DELETE FROM public.appointments 
       WHERE id = $1 AND salon_id = $2 AND status = 'pending'`,
      [frozenAppointmentId, salonId]
    );
    // Also cascade-clean appointment_services rows (FK ON DELETE CASCADE handles this automatically)
    console.log("[conversation] released frozen slot:", frozenAppointmentId);
  } catch (err: any) {
    console.error("[conversation] releaseFrozenSlot error", err.message);
  }
}

/**
 * Purges globally expired pending appointments for a salon (older than SLOT_FREEZE_TIMEOUT_MINUTES).
 * Called at the start of slot checking to free up stale frozen slots.
 */
async function purgeExpiredPendingAppointments(salonId: string): Promise<void> {
  try {
    await db.query(
      `DELETE FROM public.appointments 
       WHERE salon_id = $1 AND status = 'pending' 
       AND created_at < NOW() - INTERVAL '${SLOT_FREEZE_TIMEOUT_MINUTES} minutes'`,
      [salonId]
    );
  } catch (err: any) {
    console.error("[conversation] purgeExpiredPendingAppointments error", err.message);
  }
}

function formatBookingDetail(
  salonName: string,
  startIso: string | Date,
  durationMin: number,
  price: number,
  status: string
): string {
  const st = typeof startIso === "string" ? parseISO(startIso) : startIso;
  const local = toZonedTime(st, SALON_TIMEZONE);
  const when = format(local, "EEE, dd MMM yyyy 'at' hh:mm a");
  return (
    `*${salonName}*\n` +
    `When: ${when} (${SALON_TIMEZONE})\n` +
    `Duration: ${durationMin} min\n` +
    `Price: ₹${Number(price).toFixed(2)}\n` +
    `Status: ${status}`
  );
}

/**
 * Cancels an appointment and pushes a cancellation notification.
 */
async function cancelAppointmentById(
  salonId: string,
  appointmentId: string,
  customerPhone: string
) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    
    await client.query(
      "UPDATE public.appointments SET status = 'cancelled' WHERE id = $1 AND salon_id = $2",
      [appointmentId, salonId]
    );

    await client.query(
      "INSERT INTO public.notifications (salon_id, type, appointment_id, is_read) VALUES ($1, 'cancellation', $2, false)",
      [salonId, appointmentId]
    );

    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[conversation] cancel appointment error", err.message);
  } finally {
    client.release();
  }

  const salon = await loadSalon(salonId);
  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body: "Your appointment has been cancelled. Send *hi* to start a new booking.",
    })
  );
}

/**
 * Loads metadata configuration details for a salon.
 */
async function loadSalon(salonId: string): Promise<SalonRow> {
  const res = await db.query(
    `SELECT id, name, phone, address, city, cancellation_policy, whatsapp_phone_number_id, whatsapp_access_token 
     FROM public.salons WHERE id = $1 LIMIT 1`,
    [salonId]
  );
  if (res.rows.length === 0) {
    throw new Error("Salon not found");
  }
  return res.rows[0] as SalonRow;
}

/**
 * The core conversation bot routing controller state machine.
 */
export async function handleConversationMessage(
  salonId: string,
  customerPhoneRaw: string,
  incoming: IncomingParsed
): Promise<void> {
  const customerPhone = normalizeCustomerPhone(customerPhoneRaw);
  const salon = await loadSalon(salonId);

  const userText = incoming.kind === "text" ? incoming.body.trim() : "";
  const { state, ctx } = await getState(salonId, customerPhone);
  const kw = tokenizeKeywords(userText);

  // ── GREETING RESET ─────────────────────────────────────────────────────────
  // Any greeting resets conversation to gender selection, releasing frozen slots.
  if (incoming.kind === "text" && isGreeting(userText)) {
    await releaseFrozenSlot(salonId, customerPhone, ctx.frozenAppointmentId);
    await ensureConversationRow(salonId, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }

  // ── GLOBAL KEYWORD COMMANDS (work from any state) ──────────────────────────
  if (kw === "HELP") {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body:
          `*Commands*\n` +
          `SERVICES — list services & prices\n` +
          `LOCATION — salon address\n` +
          `HOURS — working hours\n` +
          `CONTACT — phone number\n` +
          `POLICY — cancellation policy\n` +
          `CANCEL — cancel active booking\n` +
          `RESCHEDULE — change appointment\n` +
          `Or send *hi* to start a booking.`,
      })
    );
    return;
  }

  if (kw === "SERVICES") {
    await sendServiceCatalog(salon, customerPhone);
    return;
  }
  if (kw === "LOCATION") {
    const addr = [salon.address, salon.city].filter(Boolean).join(", ") || "Address not set.";
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `📍 ${addr}` })
    );
    return;
  }
  if (kw === "CONTACT") {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `📞 ${salon.phone}` })
    );
    return;
  }
  if (kw === "POLICY") {
    const p = salon.cancellation_policy?.trim() || "No policy shared yet.";
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `*Cancellation*\n${p}` })
    );
    return;
  }
  if (kw === "HOURS") {
    await sendWorkingHoursSummary(salon, customerPhone);
    return;
  }

  // BOOK keyword — jump to date selection
  if (kw === "BOOK") {
    await releaseFrozenSlot(salonId, customerPhone, ctx.frozenAppointmentId);
    await ensureConversationRow(salonId, customerPhone, "SELECTING_DATE", {});
    await sendDateMenu(salon, customerPhone);
    return;
  }

  if (kw === "CANCEL") {
    const apt = await findActiveAppointment(salonId, customerPhone);
    if (!apt) {
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: "You don't have an active booking to cancel.",
        })
      );
      return;
    }
    await ensureConversationRow(salonId, customerPhone, state, {
      ...ctx,
      pendingCancelAppointmentId: apt.id,
    });
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppButtons(pid, tok, {
        toE164: customerPhone,
        bodyText: "Cancel your current appointment?",
        buttons: [
          { id: "cn_yes", title: "Yes, cancel" },
          { id: "cn_no", title: "Keep it" },
        ],
      })
    );
    return;
  }

  if (kw === "RESCHEDULE") {
    const apt = await findActiveAppointment(salonId, customerPhone);
    if (!apt) {
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: "You don't have an active booking to reschedule.",
        })
      );
      return;
    }

    const linesRes = await db.query(
      "SELECT service_id FROM public.appointment_services WHERE appointment_id = $1",
      [apt.id]
    );
    const ids = linesRes.rows.map((l) => l.service_id);

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE public.appointments SET status = 'cancelled' WHERE id = $1 AND salon_id = $2",
        [apt.id, salonId]
      );
      await client.query(
        "INSERT INTO public.notifications (salon_id, type, appointment_id, is_read) VALUES ($1, 'reschedule', $2, false)",
        [salonId, apt.id]
      );
      await client.query("COMMIT");
    } catch (e: any) {
      await client.query("ROLLBACK");
      console.error("[conversation] reschedule transaction failed", e.message);
    } finally {
      client.release();
    }

    // Re-use previous services if available, jump to date selection
    const nextCtx: Ctx = {
      serviceIds: ids.length ? ids : undefined,
      pendingReschedule: true,
    };
    await ensureConversationRow(salonId, customerPhone, "SELECTING_DATE", nextCtx);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Previous booking cancelled. Let's reschedule — pick a date:",
      })
    );
    await sendDateMenu(salon, customerPhone);
    return;
  }

  // ── CANCEL CONFIRM FLOW ───────────────────────────────────────────────────
  if (ctx.pendingCancelAppointmentId && incoming.kind === "interactive") {
    if (incoming.id === "cn_yes") {
      const id = ctx.pendingCancelAppointmentId;
      await ensureConversationRow(salonId, customerPhone, "IDLE", {});
      await cancelAppointmentById(salonId, id, customerPhone);
      return;
    }
    if (incoming.id === "cn_no") {
      await ensureConversationRow(salonId, customerPhone, state, {
        ...ctx,
        pendingCancelAppointmentId: undefined,
      });
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "Okay, your booking stays." })
      );
      return;
    }
  }

  if (ctx.pendingCancelAppointmentId && incoming.kind === "text") {
    const t = userText.toUpperCase();
    if (t === "YES" || t === "Y" || t === "CONFIRM") {
      const id = ctx.pendingCancelAppointmentId;
      await ensureConversationRow(salonId, customerPhone, "IDLE", {});
      await cancelAppointmentById(salonId, id, customerPhone);
      return;
    }
    if (t === "NO" || t === "N") {
      await ensureConversationRow(salonId, customerPhone, state, {
        ...ctx,
        pendingCancelAppointmentId: undefined,
      });
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "Okay, your booking stays." })
      );
      return;
    }
  }

  // ── BOOKED STATE ───────────────────────────────────────────────────────────
  if (state === "BOOKED") {
    const apt = await findActiveAppointment(salonId, customerPhone);
    if (apt) {
      const detail = formatBookingDetail(
        salon.name,
        apt.start_time,
        apt.total_duration_minutes,
        Number(apt.total_price),
        apt.status
      );
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: `${detail}\n\nSend *hi* to make a new booking or HELP for commands.`,
        })
      );
    } else {
      await ensureConversationRow(salonId, customerPhone, "SELECTING_GENDER", {});
      await sendGenderMenu(salon, customerPhone);
    }
    return;
  }

  // ── STATE MACHINE ──────────────────────────────────────────────────────────
  switch (state) {
    case "IDLE":
      await handleIdleInput(salon, customerPhone, userText, incoming, ctx);
      return;
    case "SELECTING_GENDER":
      await handleSelectingGender(salon, customerPhone, incoming, ctx);
      return;
    case "SELECTING_DATE":
      await handleSelectingDate(salon, customerPhone, userText, incoming, ctx);
      return;
    case "SELECTING_SESSION":
      await handleSelectingSession(salon, customerPhone, userText, incoming, ctx);
      return;
    case "SELECTING_SERVICES":
      await handleSelectingServices(salon, customerPhone, userText, incoming, ctx);
      return;
    case "CONFIRMING_NAME":
      await handleConfirmingName(salon, customerPhone, userText, ctx);
      return;
    default:
      await releaseFrozenSlot(salonId, customerPhone, ctx.frozenAppointmentId);
      await ensureConversationRow(salonId, customerPhone, "SELECTING_GENDER", {});
      await sendGenderMenu(salon, customerPhone);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SEND HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Sends the gender selection prompt. This is the first step after every greeting.
 */
async function sendGenderMenu(salon: SalonRow, customerPhone: string) {
  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppButtons(pid, tok, {
      toE164: customerPhone,
      bodyText: `👋 Welcome to *${salon.name}*!\n\nTo show you the right services, are you booking for:`,
      buttons: [
        { id: "btn_male", title: "👨 Male" },
        { id: "btn_female", title: "👩 Female" },
      ],
    })
  );
}

/**
 * Sends the main menu with Book Appointment and Check Services buttons.
 * Called after gender has been selected.
 */
async function sendWelcomeMenu(salon: SalonRow, customerPhone: string, gender: "male" | "female") {
  const genderLabel = gender === "male" ? "Male" : "Female";
  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppButtons(pid, tok, {
      toE164: customerPhone,
      bodyText: `Great! What would you like to do?`,
      buttons: [
        { id: "btn_book", title: "📅 Book Appointment" },
        { id: "btn_services", title: `💇 ${genderLabel} Services` },
      ],
    })
  );
}

/**
 * Sends the date selection buttons (Today / Tomorrow).
 */
async function sendDateMenu(salon: SalonRow, customerPhone: string) {
  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppButtons(pid, tok, {
      toE164: customerPhone,
      bodyText: "📅 When would you like to book?",
      buttons: [
        { id: "btn_today", title: "Today" },
        { id: "btn_tomorrow", title: "Tomorrow" },
      ],
    })
  );
}

async function sendServiceCatalog(salon: SalonRow, to: string, gender?: "male" | "female") {
  let query: string;
  let params: unknown[];

  if (gender) {
    query =
      "SELECT id, name, duration_minutes, price FROM public.services " +
      "WHERE salon_id = $1 AND is_active = true AND (gender_tag = $2 OR gender_tag = 'unisex') " +
      "ORDER BY display_order ASC";
    params = [salon.id, gender];
  } else {
    query =
      "SELECT id, name, duration_minutes, price FROM public.services " +
      "WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC";
    params = [salon.id];
  }

  const res = await db.query(query, params);

  const genderLabel = gender ? ` (${gender === "male" ? "Male" : "Female"} & Unisex)` : "";
  const lines = res.rows.map(
    (s) => `• ${s.name} — ${s.duration_minutes} min — ₹${Number(s.price).toFixed(2)}`
  );

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: to,
      body: `*Services & Prices${genderLabel}*\n${lines.length ? lines.join("\n") : "No services yet."}`,
    })
  );
}

async function sendWorkingHoursSummary(salon: SalonRow, to: string) {
  const res = await db.query(
    "SELECT day_of_week, open_time, close_time, is_closed FROM public.working_hours WHERE salon_id = $1 ORDER BY day_of_week ASC",
    [salon.id]
  );

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const text =
    res.rows
      .map((r) => {
        if (r.is_closed || !r.open_time || !r.close_time) {
          return `${names[r.day_of_week]}: Closed`;
        }
        return `${names[r.day_of_week]}: ${r.open_time.slice(0, 5)}–${r.close_time.slice(0, 5)}`;
      })
      .join("\n") || "Hours not configured.";

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, { toE164: to, body: `*Hours (${SALON_TIMEZONE})*\n${text}` })
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STATE HANDLERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * IDLE: Fallback if user is in IDLE without a gender set — redirect to gender selection.
 */
async function handleIdleInput(
  salon: SalonRow,
  customerPhone: string,
  userText: string,
  incoming: IncomingParsed,
  ctx: Ctx
) {
  const id = incoming.kind === "interactive" ? incoming.id : "";

  if (id === "btn_services") {
    await sendServiceCatalog(salon, customerPhone, ctx.gender);
    return;
  }

  if (id === "btn_book" || userText.toUpperCase() === "BOOK") {
    if (ctx.gender) {
      await ensureConversationRow(salon.id, customerPhone, "SELECTING_DATE", { gender: ctx.gender });
      await sendDateMenu(salon, customerPhone);
    } else {
      await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
      await sendGenderMenu(salon, customerPhone);
    }
    return;
  }

  // Unknown input in IDLE — re-prompt gender selection
  await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
  await sendGenderMenu(salon, customerPhone);
}

/**
 * SELECTING_GENDER: Customer picks Male or Female.
 * After selection, shows the main menu (Book / Services).
 */
async function handleSelectingGender(
  salon: SalonRow,
  customerPhone: string,
  incoming: IncomingParsed,
  ctx: Ctx
) {
  let gender: "male" | "female" | null = null;

  if (incoming.kind === "interactive") {
    if (incoming.id === "btn_male") gender = "male";
    else if (incoming.id === "btn_female") gender = "female";
  } else if (incoming.kind === "text") {
    const t = incoming.body.trim().toLowerCase();
    if (t === "male" || t === "m") gender = "male";
    else if (t === "female" || t === "f") gender = "female";
  }

  if (!gender) {
    await sendGenderMenu(salon, customerPhone);
    return;
  }

  await ensureConversationRow(salon.id, customerPhone, "IDLE", { gender });
  await sendWelcomeMenu(salon, customerPhone, gender);
}

/**
 * SELECTING_DATE: Customer picks today or tomorrow (buttons or text).
 * We just validate and save the date — NO availability pre-check here.
 * Working hours / session availability are checked in handleSelectingSession.
 */
async function handleSelectingDate(
  salon: SalonRow,
  customerPhone: string,
  userText: string,
  incoming: IncomingParsed,
  ctx: Ctx
) {
  let day: Date | null = null;

  if (incoming.kind === "interactive") {
    if (incoming.id === "btn_today") {
      day = resolveDateText("today");
    } else if (incoming.id === "btn_tomorrow") {
      day = resolveDateText("tomorrow");
    }
  }

  if (!day) {
    day = resolveDateText(userText);
  }

  if (!day) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Please choose Today or Tomorrow to continue.",
      })
    );
    await sendDateMenu(salon, customerPhone);
    return;
  }

  // Save the date and immediately show Morning / Evening buttons.
  // No availability check here — we do that when the session is actually chosen.
  await ensureConversationRow(salon.id, customerPhone, "SELECTING_SESSION", {
    ...ctx,
    selectedDayIso: day.toISOString(),
  });

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppButtons(pid, tok, {
      toE164: customerPhone,
      bodyText: `Great! Which session works for you?`,
      buttons: [
        { id: "session_morning", title: "🌅 Morning" },
        { id: "session_evening", title: "🌆 Evening" },
      ],
    })
  );
}

/**
 * SELECTING_SESSION: Customer picks Morning or Evening.
 * HERE is where we do the real working-hours + availability check.
 */
async function handleSelectingSession(
  salon: SalonRow,
  customerPhone: string,
  userText: string,
  incoming: IncomingParsed,
  ctx: Ctx
) {
  let sessionChoice = "";
  if (incoming.kind === "interactive" && incoming.id.startsWith("session_")) {
    sessionChoice = incoming.id.replace("session_", "");
  } else {
    sessionChoice = userText.trim().toLowerCase();
  }

  if (sessionChoice !== "morning" && sessionChoice !== "evening") {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppButtons(pid, tok, {
        toE164: customerPhone,
        bodyText: 'Please choose Morning or Evening:',
        buttons: [
          { id: "session_morning", title: "🌅 Morning" },
          { id: "session_evening", title: "🌆 Evening" },
        ],
      })
    );
    return;
  }

  const dayIso = ctx.selectedDayIso;
  if (!dayIso) {
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_DATE", {});
    await sendDateMenu(salon, customerPhone);
    return;
  }
  const day = parseISO(dayIso);

  // Check if the salon is open on this day and if the chosen session has capacity.
  // Use a small dummy duration (15 min) — actual duration check happens after services are chosen.
  await purgeExpiredPendingAppointments(salon.id);
  const windowRes = await getAvailableWindows(salon.id, day, 15, true);

  if (!windowRes.ok) {
    // Salon is closed or date has passed — send back to date selection
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_DATE", {});
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `${windowRes.reason} Please pick another date.`,
      })
    );
    await sendDateMenu(salon, customerPhone);
    return;
  }

  const chosenWindow = windowRes.windows.find(
    (w) => w.name.toLowerCase() === sessionChoice
  );

  if (!chosenWindow || chosenWindow.status !== "AVAILABLE") {
    // Session is fully booked — tell them and offer the other session or another date
    const other = windowRes.windows.find(
      (w) => w.name.toLowerCase() !== sessionChoice && w.status === "AVAILABLE"
    );
    const otherMsg = other
      ? `\nThe ${other.name} session (${other.range}) still has availability — would you like that instead?`
      : `\nBoth sessions are fully booked for this day. Please try another date.`;

    const buttons = other
      ? [
          { id: `session_${other.name.toLowerCase()}`, title: other.name },
          { id: "btn_today", title: "Today" },
          { id: "btn_tomorrow", title: "Tomorrow" },
        ]
      : [
          { id: "btn_today", title: "Today" },
          { id: "btn_tomorrow", title: "Tomorrow" },
        ];

    await ensureConversationRow(salon.id, customerPhone, "SELECTING_DATE", { ...ctx, selectedDayIso: undefined });
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppButtons(pid, tok, {
        toE164: customerPhone,
        bodyText: `The ${sessionChoice} session is fully booked.${otherMsg}`,
        buttons,
      })
    );
    return;
  }

  // Session is available — move to service selection
  await ensureConversationRow(salon.id, customerPhone, "SELECTING_SERVICES", {
    ...ctx,
    selectedSession: sessionChoice,
    serviceIds: [],
  });

  await sendServicesMenu(salon, customerPhone, [], ctx.gender);
}

/**
 * Sends the services selection menu as a plain-text numbered list.
 * Customer replies with numbers (e.g. "1,2,3") to select all at once,
 * then types "done" to confirm.
 * Filters by gender — always includes unisex services.
 */
async function sendServicesMenu(
  salon: SalonRow,
  customerPhone: string,
  alreadySelectedIds: string[] = [],
  gender?: "male" | "female"
) {
  let query: string;
  let params: unknown[];

  if (gender) {
    query =
      "SELECT id, name, duration_minutes, price FROM public.services " +
      "WHERE salon_id = $1 AND is_active = true AND (gender_tag = $2 OR gender_tag = 'unisex') " +
      "ORDER BY display_order ASC";
    params = [salon.id, gender];
  } else {
    query =
      "SELECT id, name, duration_minutes, price FROM public.services " +
      "WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC";
    params = [salon.id];
  }

  const res = await db.query(query, params);
  const services = res.rows;

  if (!services.length) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `${salon.name} is not accepting online bookings yet (no services configured).`,
      })
    );
    return;
  }

  const catalog = services
    .map((s, i) => {
      const tick = alreadySelectedIds.includes(s.id) ? "✅ " : "";
      return `${tick}${i + 1}. ${s.name} — ${s.duration_minutes} min — ₹${Number(s.price).toFixed(2)}`;
    })
    .join("\n");

  let footer: string;
  if (alreadySelectedIds.length === 0) {
    footer = `\n\nReply with number(s) to select, e.g. *1* or *1,2,3*\nThen reply *done* to confirm.`;
  } else {
    const selectedNames = services
      .filter((s) => alreadySelectedIds.includes(s.id))
      .map((s) => s.name)
      .join(", ");
    footer =
      `\n\n✅ *Selected:* ${selectedNames}\n` +
      `Reply more numbers to add, or *done* to confirm.`;
  }

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body: `📌 *Choose your service(s):*\n\n${catalog}${footer}`,
    })
  );
}

/**
 * SELECTING_SERVICES: Customer types service numbers all at once (e.g. "1,2,3"),
 * then types "done" to confirm. Plain-text flow — no WhatsApp interactive list.
 *
 * Each numeric input updates the selection and re-shows the menu with checkmarks.
 * "done" / "ok" / "confirm" / "yes" triggers the booking with whatever is selected.
 */
async function handleSelectingServices(
  salon: SalonRow,
  customerPhone: string,
  body: string,
  incoming: IncomingParsed,
  ctx: Ctx
) {
  const gender = ctx.gender;

  let query: string;
  let params: unknown[];

  if (gender) {
    query =
      "SELECT id, name, duration_minutes, price FROM public.services " +
      "WHERE salon_id = $1 AND is_active = true AND (gender_tag = $2 OR gender_tag = 'unisex') " +
      "ORDER BY display_order ASC";
    params = [salon.id, gender];
  } else {
    query =
      "SELECT id, name, duration_minutes, price FROM public.services " +
      "WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC";
    params = [salon.id];
  }

  const res = await db.query(query, params);
  const services = res.rows;

  if (!services.length) {
    await ensureConversationRow(salon.id, customerPhone, "IDLE", { gender });
    return;
  }

  const selected = new Set<string>(ctx.serviceIds ?? []);

  // Normalise input — interactive taps (svc_done from old sessions) still handled
  const inputId = incoming.kind === "interactive" ? incoming.id : "";
  const textBody = body.trim().toLowerCase();

  // Check if this is a confirm signal
  const isDone =
    inputId === "svc_done" ||
    ["done", "ok", "confirm", "yes"].includes(textBody);

  if (!isDone) {
    // Parse number(s) from text — e.g. "1", "1,2", "1 2 3", "1,2,3"
    const parts = body.split(/[\s,\/]+/).map((x) => x.trim()).filter(Boolean);
    let addedAny = false;
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 1 || n > services.length) continue;
      const svcId = services[n - 1].id;
      if (selected.has(svcId)) {
        selected.delete(svcId); // toggle off if already selected
      } else {
        selected.add(svcId);
      }
      addedAny = true;
    }

    if (addedAny || selected.size > 0) {
      // Save and re-show updated menu
      await ensureConversationRow(salon.id, customerPhone, "SELECTING_SERVICES", {
        ...ctx,
        serviceIds: Array.from(selected),
      });
      await sendServicesMenu(salon, customerPhone, Array.from(selected), gender);
      return;
    }

    // Nothing parseable typed and nothing selected yet
    await sendServicesMenu(salon, customerPhone, [], gender);
    return;
  }

  // ── CONFIRM (isDone or text path with no valid numbers entered) ─────────────
  if (selected.size === 0) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Please pick at least one service first.",
      })
    );
    await sendServicesMenu(salon, customerPhone, [], gender);
    return;
  }

  const list = services.filter((s) => selected.has(s.id));
  const totalDur = list.reduce((a, s) => a + s.duration_minutes, 0);
  const totalPrice = list.reduce((a, s) => a + Number(s.price), 0);

  // Now validate slot availability with actual duration
  const dayIso = ctx.selectedDayIso;
  const sessionChoice = ctx.selectedSession;
  if (!dayIso || !sessionChoice) {
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }
  const day = parseISO(dayIso);

  await purgeExpiredPendingAppointments(salon.id);
  const windowRes = await getAvailableWindows(salon.id, day, totalDur, true);
  if (!windowRes.ok) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, { toE164: customerPhone, body: windowRes.reason })
    );
    return;
  }

  const selectedWindow = windowRes.windows.find((w) => w.name.toLowerCase() === sessionChoice);
  if (!selectedWindow || selectedWindow.status !== "AVAILABLE") {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `The ${sessionChoice} session is no longer available for your selected services. Please pick another time.`,
      })
    );
    // Go back to session selection
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_SESSION", {
      ...ctx,
      serviceIds: Array.from(selected),
    });
    const avail = windowRes.windows.filter((w) => w.status === "AVAILABLE");
    const buttons = avail.slice(0, 3).map((w) => ({
      id: `session_${w.name.toLowerCase()}`,
      title: w.name,
    }));
    const textLines = avail.map((w) => `• ${w.name} (${w.range})`);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppButtons(pid, tok, {
        toE164: customerPhone,
        bodyText: `Available sessions:\n${textLines.join("\n")}\n\nChoose a session:`,
        buttons,
      })
    );
    return;
  }

  // Compute the assigned start time using staff assignment or queue logic
  const staffResult = await assignStaff(
    salon.id,
    Array.from(selected),
    selectedWindow.startUtc,
    totalDur
  );

  let assignedStartUtc: Date;
  let assignedStaffId: string | undefined;
  let assignedStaffName: string | undefined;

  if (staffResult) {
    assignedStartUtc = staffResult.assignedStartUtc;
    assignedStaffId = staffResult.staffId;
    assignedStaffName = staffResult.staffName;
  } else {
    // No staff — use salon-level queue: find latest end_time in this session window
    const busyRes = await db.query(
      `SELECT end_time FROM public.appointments 
       WHERE salon_id = $1 AND status IN ('pending', 'confirmed') 
       AND start_time >= $2 AND start_time < $3 
       ORDER BY end_time DESC LIMIT 1`,
      [salon.id, selectedWindow.startUtc.toISOString(), selectedWindow.endUtc.toISOString()]
    );
    assignedStartUtc = selectedWindow.startUtc;
    if (busyRes.rows.length > 0) {
      const lastEndTime = parseISO(busyRes.rows[0].end_time);
      assignedStartUtc = addMinutes(lastEndTime, APPOINTMENT_BUFFER_MINUTES);
    }
  }

  // ── CUSTOMER TRAVEL BUFFER (bot bookings only) ───────────────────────────────
  // Ensure the slot starts at least CUSTOMER_TRAVEL_BUFFER_MINUTES from now.
  // This gives walk-in customers time to physically reach the salon.
  // Walk-in / dashboard bookings bypass this (they go through different API routes).
  const earliestAllowed = addMinutes(new Date(), CUSTOMER_TRAVEL_BUFFER_MINUTES);
  if (assignedStartUtc < earliestAllowed) {
    assignedStartUtc = earliestAllowed;
  }

  const endTime = addMinutes(assignedStartUtc, totalDur + APPOINTMENT_BUFFER_MINUTES);

  // ── FREEZE THE SLOT ─────────────────────────────────────────────────────────
  // Release any previous frozen slot first
  await releaseFrozenSlot(salon.id, customerPhone, ctx.frozenAppointmentId);

  // We need a placeholder customer record to satisfy the FK; get or create anonymous entry
  let customerId: string;
  try {
    const existing = await db.query(
      "SELECT id FROM public.customers WHERE salon_id = $1 AND phone = $2 LIMIT 1",
      [salon.id, customerPhone]
    );
    if (existing.rows.length > 0) {
      customerId = existing.rows[0].id;
    } else {
      const created = await db.query(
        "INSERT INTO public.customers (salon_id, phone, name) VALUES ($1, $2, $3) RETURNING id",
        [salon.id, customerPhone, ""]
      );
      customerId = created.rows[0].id;
    }

    const frozenInsert = await db.query(
      `INSERT INTO public.appointments 
       (salon_id, customer_id, start_time, end_time, total_duration_minutes, total_price, status, reminder_sent, staff_id) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', false, $7) RETURNING id`,
      [salon.id, customerId, assignedStartUtc.toISOString(), endTime.toISOString(), totalDur, totalPrice, assignedStaffId ?? null]
    );
    const frozenId: string = frozenInsert.rows[0].id;

    // Insert appointment_services for the frozen record too
    for (const svc of list) {
      await db.query(
        `INSERT INTO public.appointment_services (appointment_id, service_id, price_at_booking, duration_at_booking) 
         VALUES ($1, $2, $3, $4)`,
        [frozenId, svc.id, Number(svc.price), svc.duration_minutes]
      );
    }

    // Save frozen appointment id in context, move to name confirmation
    await ensureConversationRow(salon.id, customerPhone, "CONFIRMING_NAME", {
      ...ctx,
      serviceIds: Array.from(selected),
      slotStarts: [assignedStartUtc.toISOString()],
      selectedSlotIndex: 1,
      assignedStaffId,
      assignedStaffName,
      frozenAppointmentId: frozenId,
    });

    const localStart = toZonedTime(assignedStartUtc, SALON_TIMEZONE);
    const timeStr = format(localStart, "hh:mm a");
    const svcSummary = list.map((s) => `• ${s.name}`).join("\n");
    const staffLine = assignedStaffName
      ? `with *${assignedStaffName}*`
      : ``;

    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body:
          `✅ *Your slot is reserved!*\n\n` +
          `${svcSummary}\n\n` +
          `🕐 *${timeStr}* (${SALON_TIMEZONE}) ${staffLine}\n` +
          `💰 Total: ₹${totalPrice.toFixed(2)} | ${totalDur} min\n\n` +
          `What's your name for the booking?`,
      })
    );
  } catch (err: any) {
    console.error("[conversation] freeze slot error", err.message);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Could not reserve your slot. Please try again.",
      })
    );
  }
}

/**
 * CONFIRMING_NAME: Customer provides their name to finalise the booking.
 * Upgrades the frozen pending appointment to confirmed.
 */
async function handleConfirmingName(
  salon: SalonRow,
  customerPhone: string,
  body: string,
  ctx: Ctx
) {
  const name = body.trim();
  if (name.length < 2) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Please send your full name to confirm the booking.",
      })
    );
    return;
  }

  const frozenId = ctx.frozenAppointmentId;
  if (!frozenId) {
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }

  // Verify the frozen appointment still exists and is still pending (not expired/taken)
  const checkRes = await db.query(
    `SELECT id, start_time, end_time, total_duration_minutes, total_price, staff_id 
     FROM public.appointments WHERE id = $1 AND salon_id = $2 AND status = 'pending' LIMIT 1`,
    [frozenId, salon.id]
  );
  if (checkRes.rows.length === 0) {
    // Slot expired or was taken by someone else - restart cleanly via gender selection

    await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }

  const apt = checkRes.rows[0];
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // Update customer name
    await client.query(
      "UPDATE public.customers SET name = $1 WHERE salon_id = $2 AND phone = $3",
      [name, salon.id, customerPhone]
    );

    // Confirm the frozen appointment
    await client.query(
      "UPDATE public.appointments SET status = 'confirmed', reminder_sent = false WHERE id = $1",
      [frozenId]
    );

    // Insert booking notification
    await client.query(
      "INSERT INTO public.notifications (salon_id, type, appointment_id, is_read) VALUES ($1, 'new_booking', $2, false)",
      [salon.id, frozenId]
    );

    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
    client.release();
    console.error("[conversation] confirm booking error", err.message);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Could not confirm your booking. Please try again.",
      })
    );
    return;
  }

  client.release();

  await ensureConversationRow(salon.id, customerPhone, "BOOKED", {});

  // Load service rows for the confirmation message
  const svcRes = await db.query(
    `SELECT s.name, as2.price_at_booking, as2.duration_at_booking
     FROM public.appointment_services as2
     JOIN public.services s ON s.id = as2.service_id
     WHERE as2.appointment_id = $1`,
    [frozenId]
  );

  const local = toZonedTime(new Date(apt.start_time), SALON_TIMEZONE);
  const when = format(local, "EEE dd MMM, hh:mm a");
  const svcLine = svcRes.rows.map((s) => `• ${s.name}`).join("\n");
  const staffConfirmLine = ctx.assignedStaffName ? `Staff: ${ctx.assignedStaffName}\n` : "";

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body:
        `✅ *Booking confirmed!*\n\n` +
        `${svcLine}\n` +
        `📅 ${when} (${SALON_TIMEZONE})\n` +
        `${staffConfirmLine}` +
        `💰 Total: ₹${Number(apt.total_price).toFixed(2)}\n` +
        `👤 Name: ${name}\n\n` +
        `Send HELP anytime or *hi* to make another booking.`,
    })
  );
}

// ────────────────────────────────────────────────────────────────────────────
// DATE RESOLVER
// ────────────────────────────────────────────────────────────────────────────

function resolveDateText(body: string): Date | null {
  const t = body.trim().toLowerCase();
  const now = new Date();
  const z = toZonedTime(now, SALON_TIMEZONE);
  if (t === "today") {
    return parseISO(`${format(z, "yyyy-MM-dd")}T00:00:00+05:30`);
  }
  if (t === "tomorrow") {
    const d = addMinutes(parseISO(`${format(z, "yyyy-MM-dd")}T00:00:00+05:30`), 24 * 60);
    return d;
  }
  return parseDdMmYyyyKolkata(body);
}
