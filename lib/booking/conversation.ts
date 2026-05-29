import { addMinutes, format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { z } from "zod";
import { APPOINTMENT_BUFFER_MINUTES, SALON_TIMEZONE } from "@/lib/constants";
import { normalizeCustomerPhone } from "@/lib/booking/phone";
import { db } from "@/lib/db";
import {
  getAvailableWindows,
  parseDdMmYyyyKolkata,
} from "@/lib/booking/slots";
import {
  sendWhatsAppText,
  sendWhatsAppList,
  sendWhatsAppButtons,
} from "@/lib/whatsapp/send";

const CtxSchema = z.object({
  serviceIds: z.array(z.string().uuid()).optional(),
  pendingDateInput: z.string().optional(),
  selectedDayIso: z.string().optional(),
  slotStarts: z.array(z.string()).optional(),
  selectedSlotIndex: z.number().int().optional(),
  pendingCancelAppointmentId: z.string().uuid().optional(),
  pendingReschedule: z.boolean().optional(),
  lastListMax: z.number().int().optional(),
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
  };
  return map[t] ?? null;
}

async function sendAuth(
  salon: SalonRow,
  fn: (pid: string, token: string) => Promise<{ ok: boolean; error?: string }>
) {
  const pid = salon.whatsapp_phone_number_id;
  const token = salon.whatsapp_access_token;
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
      body: "Your appointment has been cancelled. Send BOOK when you're ready to book again.",
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
          `Or chat to book a visit.`,
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

    // Retrieve active appointment service relations
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

    if (!ids.length) {
      await ensureConversationRow(salonId, customerPhone, "SELECTING_SERVICES", {});
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: "Previous booking cleared. Let's pick your services again.",
        })
      );
      await startIdleFlow(salon, customerPhone);
      return;
    }

    const nextCtx: Ctx = {
      ...ctx,
      serviceIds: ids,
      pendingReschedule: true,
      selectedDayIso: undefined,
      slotStarts: undefined,
    };
    await ensureConversationRow(salonId, customerPhone, "SELECTING_DATE", nextCtx);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Previous booking cancelled for reschedule. Please send your preferred date (DD/MM/YYYY), or say today / tomorrow.",
      })
    );
    return;
  }

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
          body: `${detail}\n\nSend HELP for commands.`,
        })
      );
    } else {
      await ensureConversationRow(salonId, customerPhone, "IDLE", {});
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: `Hi! Welcome to ${salon.name}. Let's pick your services — sending the menu now.`,
        })
      );
      await startIdleFlow(salon, customerPhone);
    }
    return;
  }

  const servicesInput =
    incoming.kind === "interactive" && incoming.id.startsWith("svc_")
      ? incoming.id
      : userText;

  switch (state) {
    case "IDLE":
      await startIdleFlow(salon, customerPhone);
      return;
    case "SELECTING_SERVICES":
      await handleSelectingServices(salon, customerPhone, servicesInput, ctx);
      return;
    case "SELECTING_DATE":
      await handleSelectingDate(salon, customerPhone, userText, ctx);
      return;
    case "SELECTING_SESSION":
      await handleSelectingSession(salon, customerPhone, userText, incoming, ctx);
      return;
    case "CONFIRMING_NAME":
      await handleConfirmingName(salon, customerPhone, userText, ctx);
      return;
    default:
      await ensureConversationRow(salonId, customerPhone, "IDLE", {});
      await startIdleFlow(salon, customerPhone);
  }
}

async function sendServiceCatalog(salon: SalonRow, to: string) {
  const res = await db.query(
    "SELECT id, name, duration_minutes, price FROM public.services WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC",
    [salon.id]
  );
  
  const lines = res.rows.map(
    (s) => `• ${s.name} — ${s.duration_minutes} min — ₹${Number(s.price).toFixed(2)}`
  );

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: to,
      body: `*Services*\n${lines.length ? lines.join("\n") : "No services yet."}`,
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

async function startIdleFlow(salon: SalonRow, customerPhone: string) {
  const res = await db.query(
    "SELECT id, name, duration_minutes, price FROM public.services WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC",
    [salon.id]
  );
  const services = res.rows;

  if (!services.length) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `${salon.name} is not accepting online bookings yet (no services).`,
      })
    );
    return;
  }

  await ensureConversationRow(salon.id, customerPhone, "SELECTING_SERVICES", {
    serviceIds: [],
  });

  if (services.length <= 10) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppList(pid, tok, {
        toE164: customerPhone,
        bodyText: `Hi! Choose one service to begin (you can add more by sending numbers like 1,2).`,
        buttonText: "Pick service",
        sections: [
          {
            title: "Services",
            rows: services.map((s, i) => ({
              id: `svc_${s.id}`,
              title: `${i + 1}. ${s.name}`.slice(0, 24),
              description: `${s.duration_minutes}m · ₹${Number(s.price).toFixed(0)}`.slice(0, 72),
            })),
          },
        ],
      })
    );
    const catalog = services
      .map(
        (s, i) =>
          `${i + 1}. ${s.name} — ${s.duration_minutes} min — ₹${Number(s.price).toFixed(2)}`
      )
      .join("\n");
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `Or reply with numbers for multiple services:\n${catalog}`,
      })
    );
  } else {
    const catalog = services
      .map(
        (s, i) =>
          `${i + 1}. ${s.name} — ${s.duration_minutes} min — ₹${Number(s.price).toFixed(2)}`
      )
      .join("\n");
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `Hi! Reply with service numbers separated by commas (e.g. 1,3).\n\n${catalog}`,
      })
    );
  }
}

async function handleSelectingServices(
  salon: SalonRow,
  customerPhone: string,
  body: string,
  ctx: Ctx
) {
  const res = await db.query(
    "SELECT id, name, duration_minutes, price FROM public.services WHERE salon_id = $1 AND is_active = true ORDER BY display_order ASC",
    [salon.id]
  );
  const services = res.rows;

  if (!services.length) {
    await ensureConversationRow(salon.id, customerPhone, "IDLE", {});
    return;
  }

  const selected = new Set<string>(ctx.serviceIds ?? []);

  if (body.startsWith("svc_")) {
    const id = body.replace("svc_", "");
    if (services.some((s) => s.id === id)) {
      selected.add(id);
    }
  } else {
    const parts = body.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 1 || n > services.length) continue;
      selected.add(services[n - 1].id);
    }
  }

  if (selected.size === 0) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Please pick at least one service (numbers like 1 or 1,2).",
      })
    );
    return;
  }

  const list = services.filter((s) => selected.has(s.id));
  const totalDur = list.reduce((a, s) => a + s.duration_minutes, 0);
  const totalPrice = list.reduce((a, s) => a + Number(s.price), 0);

  const summary =
    list.map((s) => `• ${s.name}`).join("\n") +
    `\n\nTotal: ${totalDur} min · ₹${totalPrice.toFixed(2)}`;

  await ensureConversationRow(salon.id, customerPhone, "SELECTING_DATE", {
    serviceIds: Array.from(selected),
  });

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body: `${summary}\n\nSend your preferred date as DD/MM/YYYY, or say *today* or *tomorrow*.`,
    })
  );
}

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

async function handleSelectingDate(
  salon: SalonRow,
  customerPhone: string,
  body: string,
  ctx: Ctx
) {
  const ids = ctx.serviceIds ?? [];
  if (ids.length === 0) {
    await ensureConversationRow(salon.id, customerPhone, "IDLE", {});
    await startIdleFlow(salon, customerPhone);
    return;
  }

  // Load selected services directly via SQL parameterized array mapping
  const res = await db.query(
    "SELECT duration_minutes, price FROM public.services WHERE id = ANY($1::uuid[])",
    [ids]
  );
  const services = res.rows;

  const totalDur = services.reduce((a, s) => a + s.duration_minutes, 0);
  const day = resolveDateText(body);

  if (!day) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Invalid date. Use DD/MM/YYYY or today / tomorrow.",
      })
    );
    return;
  }

  const windowRes = await getAvailableWindows(salon.id, day, totalDur);
  if (!windowRes.ok) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, { toE164: customerPhone, body: windowRes.reason })
    );
    return;
  }

  const availableWindows = windowRes.windows.filter((w) => w.status === "AVAILABLE");

  if (availableWindows.length === 0) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "No sessions available for this date. Please try another date.",
      })
    );
    return;
  }

  await ensureConversationRow(salon.id, customerPhone, "SELECTING_SESSION", {
    ...ctx,
    selectedDayIso: day.toISOString(),
  });

  const buttons = availableWindows.map((w) => ({
    id: `session_${w.name.toLowerCase()}`,
    title: w.name,
  }));

  const textLines = availableWindows.map((w) => `• ${w.name} (${w.range})`);

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppButtons(pid, tok, {
      toE164: customerPhone,
      bodyText: `Available sessions:\n${textLines.join("\n")}\n\nTap a session or reply with "Morning" or "Evening".`,
      buttons,
    })
  );
}

async function handleSelectingSession(
  salon: SalonRow,
  customerPhone: string,
  body: string,
  incoming: IncomingParsed,
  ctx: Ctx
) {
  const dayIso = ctx.selectedDayIso;
  if (!dayIso) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Something went wrong. Let's start over.",
      })
    );
    await ensureConversationRow(salon.id, customerPhone, "IDLE", {});
    await startIdleFlow(salon, customerPhone);
    return;
  }
  const day = parseISO(dayIso);

  let sessionChoice = "";
  if (incoming.kind === "interactive" && incoming.id.startsWith("session_")) {
    sessionChoice = incoming.id.replace("session_", "");
  } else {
    sessionChoice = body.trim().toLowerCase();
  }

  if (sessionChoice !== "morning" && sessionChoice !== "evening") {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: 'Please choose "Morning" or "Evening".',
      })
    );
    return;
  }

  const ids = ctx.serviceIds ?? [];
  const res = await db.query(
    "SELECT duration_minutes FROM public.services WHERE id = ANY($1::uuid[])",
    [ids]
  );
  const services = res.rows;
  const totalDur = services.reduce((a, s) => a + s.duration_minutes, 0);

  const windowRes = await getAvailableWindows(salon.id, day, totalDur);
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
        body: "That session is no longer available. Please pick another one or try a different date.",
      })
    );
    return;
  }

  // Get active queue appointments in the window using standard parameterized SQL
  const busyRes = await db.query(
    `SELECT end_time FROM public.appointments 
     WHERE salon_id = $1 AND status IN ('pending', 'confirmed') 
     AND start_time >= $2 AND start_time < $3 
     ORDER BY end_time DESC LIMIT 1`,
    [salon.id, selectedWindow.startUtc.toISOString(), selectedWindow.endUtc.toISOString()]
  );
  const busyRows = busyRes.rows;

  let assignedStartUtc = selectedWindow.startUtc;
  if (busyRows && busyRows.length > 0) {
    const lastEndTime = parseISO(busyRows[0].end_time);
    assignedStartUtc = addMinutes(lastEndTime, APPOINTMENT_BUFFER_MINUTES);
  }

  await ensureConversationRow(salon.id, customerPhone, "CONFIRMING_NAME", {
    ...ctx,
    slotStarts: [assignedStartUtc.toISOString()],
    selectedSlotIndex: 1,
  });

  const localStart = toZonedTime(assignedStartUtc, SALON_TIMEZONE);
  const timeStr = format(localStart, "hh:mm a");

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body: `You've been added to the queue! Your estimated start time is *${timeStr}* (${SALON_TIMEZONE}). What's your name for the booking?`,
    })
  );
}

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
        body: "Please send your full name.",
      })
    );
    return;
  }

  const ids = ctx.serviceIds ?? [];
  const slotIdx = ctx.selectedSlotIndex;
  const starts = ctx.slotStarts ?? [];
  if (!ids.length || !slotIdx || !starts[slotIdx - 1]) {
    await ensureConversationRow(salon.id, customerPhone, "IDLE", {});
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Something went wrong. Let's start over — sending services.",
      })
    );
    await startIdleFlow(salon, customerPhone);
    return;
  }

  const startIso = starts[slotIdx - 1];
  const startTime = parseISO(startIso);

  const svcRes = await db.query(
    "SELECT id, name, duration_minutes, price FROM public.services WHERE id = ANY($1::uuid[])",
    [ids]
  );
  const svcRows = svcRes.rows;
  if (!svcRows.length) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Could not load services. Try again later.",
      })
    );
    return;
  }

  const totalDur = svcRows.reduce((a, s) => a + s.duration_minutes, 0);
  const totalPrice = svcRows.reduce((a, s) => a + Number(s.price), 0);
  const endTime = addMinutes(startTime, totalDur + APPOINTMENT_BUFFER_MINUTES);

  // Database Connection for Transaction
  const client = await db.pool.connect();
  let customerId = "";

  try {
    await client.query("BEGIN");

    // 1. Get or create customer inside transaction
    const existing = await client.query(
      "SELECT id FROM public.customers WHERE salon_id = $1 AND phone = $2 LIMIT 1",
      [salon.id, customerPhone]
    );

    if (existing.rows.length > 0) {
      customerId = existing.rows[0].id;
      await client.query(
        "UPDATE public.customers SET name = $1 WHERE id = $2",
        [name, customerId]
      );
    } else {
      const created = await client.query(
        "INSERT INTO public.customers (salon_id, phone, name) VALUES ($1, $2, $3) RETURNING id",
        [salon.id, customerPhone, name]
      );
      customerId = created.rows[0].id;
    }

    // 2. Insert Appointment
    const aptInsert = await client.query(
      `INSERT INTO public.appointments 
       (salon_id, customer_id, start_time, end_time, total_duration_minutes, total_price, status, reminder_sent) 
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', false) RETURNING id`,
      [salon.id, customerId, startTime.toISOString(), endTime.toISOString(), totalDur, totalPrice]
    );
    const appointmentId = aptInsert.rows[0].id;

    // 3. Insert Appointment Services
    for (const s of svcRows) {
      await client.query(
        `INSERT INTO public.appointment_services (appointment_id, service_id, price_at_booking, duration_at_booking) 
         VALUES ($1, $2, $3, $4)`,
        [appointmentId, s.id, Number(s.price), s.duration_minutes]
      );
    }

    // 4. Insert Notification
    await client.query(
      "INSERT INTO public.notifications (salon_id, type, appointment_id, is_read) VALUES ($1, 'new_booking', $2, false)",
      [salon.id, appointmentId]
    );

    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
    client.release();
    console.error("[conversation] booking transaction failed", err.message);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Could not create booking. Try another slot.",
      })
    );
    return;
  }
  
  client.release();

  await ensureConversationRow(salon.id, customerPhone, "BOOKED", {});

  const local = toZonedTime(startTime, SALON_TIMEZONE);
  const when = format(local, "EEE dd MMM, hh:mm a");
  const svcLine = svcRows.map((s) => `• ${s.name}`).join("\n");

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body:
        `✅ *Booking confirmed*\n` +
        `${svcLine}\n` +
        `When: ${when} (${SALON_TIMEZONE})\n` +
        `Total: ₹${totalPrice.toFixed(2)}\n` +
        `Name: ${name}\n\n` +
        `Send HELP anytime.`,
    })
  );
}
