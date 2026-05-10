import { addMinutes, format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { APPOINTMENT_BUFFER_MINUTES, SALON_TIMEZONE } from "@/lib/constants";
import type { ConversationState, Database, Json } from "@/lib/types/database";
import { normalizeCustomerPhone } from "@/lib/booking/phone";
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

function parseContext(raw: Json): Ctx {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const parsed = CtxSchema.safeParse(o);
  return parsed.success ? parsed.data : {};
}

function toJson(ctx: Ctx): Json {
  return ctx as Json;
}

async function ensureConversationRow(
  admin: SupabaseClient<Database>,
  salonId: string,
  phone: string,
  state: ConversationState,
  ctx: Ctx
): Promise<void> {
  const { error } = await admin.from("conversation_states").upsert(
    {
      salon_id: salonId,
      customer_phone: phone,
      state,
      context: toJson(ctx),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "salon_id,customer_phone" }
  );
  if (error) {
    console.error("[conversation] upsert state", error.message);
  }
}

async function getState(
  admin: SupabaseClient<Database>,
  salonId: string,
  phone: string
): Promise<{ state: ConversationState; ctx: Ctx }> {
  const { data, error } = await admin
    .from("conversation_states")
    .select("state, context")
    .eq("salon_id", salonId)
    .eq("customer_phone", phone)
    .maybeSingle();
  if (error) {
    console.error("[conversation] get state", error.message);
  }
  if (!data) {
    return { state: "IDLE", ctx: {} };
  }
  return { state: data.state, ctx: parseContext(data.context) };
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

async function findActiveAppointment(
  admin: SupabaseClient<Database>,
  salonId: string,
  customerPhone: string
) {
  const { data: cust } = await admin
    .from("customers")
    .select("id")
    .eq("salon_id", salonId)
    .eq("phone", customerPhone)
    .maybeSingle();
  if (!cust) return null;

  const { data: apt } = await admin
    .from("appointments")
    .select("id, start_time, status, total_price, total_duration_minutes")
    .eq("salon_id", salonId)
    .eq("customer_id", cust.id)
    .in("status", ["pending", "confirmed"])
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  return apt;
}

function formatBookingDetail(
  salonName: string,
  startIso: string,
  durationMin: number,
  price: number,
  status: string
): string {
  const st = parseISO(startIso);
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

async function cancelAppointmentById(
  admin: SupabaseClient<Database>,
  salonId: string,
  appointmentId: string,
  customerPhone: string
) {
  await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .eq("salon_id", salonId);

  await admin.from("notifications").insert({
    salon_id: salonId,
    type: "cancellation",
    appointment_id: appointmentId,
    is_read: false,
  });

  await sendAuth(await loadSalon(admin, salonId), (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body: "Your appointment has been cancelled. Send BOOK when you're ready to book again.",
    })
  );
}

async function loadSalon(
  admin: SupabaseClient<Database>,
  salonId: string
): Promise<SalonRow> {
  const { data, error } = await admin
    .from("salons")
    .select(
      "id, name, phone, address, city, cancellation_policy, whatsapp_phone_number_id, whatsapp_access_token"
    )
    .eq("id", salonId)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Salon not found");
  }
  return data as SalonRow;
}

export async function handleConversationMessage(
  admin: SupabaseClient<Database>,
  salonId: string,
  customerPhoneRaw: string,
  incoming: IncomingParsed
): Promise<void> {
  const customerPhone = normalizeCustomerPhone(customerPhoneRaw);
  const salon = await loadSalon(admin, salonId);

  const userText = incoming.kind === "text" ? incoming.body.trim() : "";

  const { state, ctx } = await getState(admin, salonId, customerPhone);

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
    await sendServiceCatalog(admin, salon, customerPhone);
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
    await sendWorkingHoursSummary(admin, salon, customerPhone);
    return;
  }

  if (kw === "CANCEL") {
    const apt = await findActiveAppointment(admin, salonId, customerPhone);
    if (!apt) {
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: "You don't have an active booking to cancel.",
        })
      );
      return;
    }
    await ensureConversationRow(admin, salonId, customerPhone, state, {
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
    const apt = await findActiveAppointment(admin, salonId, customerPhone);
    if (!apt) {
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: "You don't have an active booking to reschedule.",
        })
      );
      return;
    }
    const { data: lines } = await admin
      .from("appointment_services")
      .select("service_id")
      .eq("appointment_id", apt.id);
    const ids = (lines ?? []).map((l) => l.service_id);

    await admin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", apt.id)
      .eq("salon_id", salonId);

    await admin.from("notifications").insert({
      salon_id: salonId,
      type: "reschedule",
      appointment_id: apt.id,
      is_read: false,
    });

    if (!ids.length) {
      await ensureConversationRow(admin, salonId, customerPhone, "SELECTING_SERVICES", {});
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: "Previous booking cleared. Let's pick your services again.",
        })
      );
      await startIdleFlow(admin, salon, customerPhone);
      return;
    }

    const nextCtx: Ctx = {
      ...ctx,
      serviceIds: ids,
      pendingReschedule: true,
      selectedDayIso: undefined,
      slotStarts: undefined,
    };
    await ensureConversationRow(admin, salonId, customerPhone, "SELECTING_DATE", nextCtx);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body:
          "Previous booking cancelled for reschedule. Please send your preferred date (DD/MM/YYYY), or say today / tomorrow.",
      })
    );
    return;
  }

  if (ctx.pendingCancelAppointmentId && incoming.kind === "interactive") {
    if (incoming.id === "cn_yes") {
      const id = ctx.pendingCancelAppointmentId;
      await ensureConversationRow(admin, salonId, customerPhone, "IDLE", {});
      await cancelAppointmentById(admin, salonId, id, customerPhone);
      return;
    }
    if (incoming.id === "cn_no") {
      await ensureConversationRow(admin, salonId, customerPhone, state, {
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
      await ensureConversationRow(admin, salonId, customerPhone, "IDLE", {});
      await cancelAppointmentById(admin, salonId, id, customerPhone);
      return;
    }
    if (t === "NO" || t === "N") {
      await ensureConversationRow(admin, salonId, customerPhone, state, {
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
    const apt = await findActiveAppointment(admin, salonId, customerPhone);
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
      await ensureConversationRow(admin, salonId, customerPhone, "IDLE", {});
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: `Hi! Welcome to ${salon.name}. Let's pick your services — sending the menu now.`,
        })
      );
      await startIdleFlow(admin, salon, customerPhone);
    }
    return;
  }

  const servicesInput =
    incoming.kind === "interactive" && incoming.id.startsWith("svc_")
      ? incoming.id
      : userText;

  switch (state) {
    case "IDLE":
      await startIdleFlow(admin, salon, customerPhone);
      return;
    case "SELECTING_SERVICES":
      await handleSelectingServices(admin, salon, customerPhone, servicesInput, ctx);
      return;
    case "SELECTING_DATE":
      await handleSelectingDate(admin, salon, customerPhone, userText, ctx);
      return;
    case "SELECTING_SESSION":
      await handleSelectingSession(admin, salon, customerPhone, userText, incoming, ctx);
      return;
    case "CONFIRMING_NAME":
      await handleConfirmingName(admin, salon, customerPhone, userText, ctx);
      return;
    default:
      await ensureConversationRow(admin, salonId, customerPhone, "IDLE", {});
      await startIdleFlow(admin, salon, customerPhone);
  }
}

async function sendServiceCatalog(
  admin: SupabaseClient<Database>,
  salon: SalonRow,
  to: string
) {
  const { data: services } = await admin
    .from("services")
    .select("id, name, duration_minutes, price")
    .eq("salon_id", salon.id)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const lines =
    services?.map(
      (s) =>
        `• ${s.name} — ${s.duration_minutes} min — ₹${Number(s.price).toFixed(2)}`
    ) ?? [];

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: to,
      body: `*Services*\n${lines.length ? lines.join("\n") : "No services yet."}`,
    })
  );
}

async function sendWorkingHoursSummary(
  admin: SupabaseClient<Database>,
  salon: SalonRow,
  to: string
) {
  const { data: rows } = await admin
    .from("working_hours")
    .select("day_of_week, open_time, close_time, is_closed")
    .eq("salon_id", salon.id)
    .order("day_of_week", { ascending: true });

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const text =
    rows
      ?.map((r) => {
        if (r.is_closed || !r.open_time || !r.close_time) {
          return `${names[r.day_of_week]}: Closed`;
        }
        return `${names[r.day_of_week]}: ${r.open_time.slice(0, 5)}–${r.close_time.slice(0, 5)}`;
      })
      .join("\n") ?? "Hours not configured.";

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, { toE164: to, body: `*Hours (${SALON_TIMEZONE})*\n${text}` })
  );
}

async function startIdleFlow(
  admin: SupabaseClient<Database>,
  salon: SalonRow,
  customerPhone: string
) {
  const { data: services } = await admin
    .from("services")
    .select("id, name, duration_minutes, price")
    .eq("salon_id", salon.id)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (!services?.length) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `${salon.name} is not accepting online bookings yet (no services).`,
      })
    );
    return;
  }

  await ensureConversationRow(admin, salon.id, customerPhone, "SELECTING_SERVICES", {
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
              description: `${s.duration_minutes}m · ₹${Number(s.price).toFixed(0)}`.slice(
                0,
                72
              ),
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
  admin: SupabaseClient<Database>,
  salon: SalonRow,
  customerPhone: string,
  body: string,
  ctx: Ctx
) {
  const { data: services } = await admin
    .from("services")
    .select("id, name, duration_minutes, price")
    .eq("salon_id", salon.id)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (!services?.length) {
    await ensureConversationRow(admin, salon.id, customerPhone, "IDLE", {});
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
      selected.add(services[n - 1]!.id);
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

  await ensureConversationRow(admin, salon.id, customerPhone, "SELECTING_DATE", {
    serviceIds: Array.from(selected),
  });

  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body:
        `${summary}\n\nSend your preferred date as DD/MM/YYYY, or say *today* or *tomorrow*.`,
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
  admin: SupabaseClient<Database>,
  salon: SalonRow,
  customerPhone: string,
  body: string,
  ctx: Ctx
) {
  const ids = ctx.serviceIds ?? [];
  if (ids.length === 0) {
    await ensureConversationRow(admin, salon.id, customerPhone, "IDLE", {});
    await startIdleFlow(admin, salon, customerPhone);
    return;
  }

  const { data: services } = await admin
    .from("services")
    .select("duration_minutes, price")
    .in("id", ids);

  const totalDur =
    services?.reduce((a, s) => a + s.duration_minutes, 0) ?? 0;

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

  const windowRes = await getAvailableWindows(admin, salon.id, day, totalDur);
  if (!windowRes.ok) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, { toE164: customerPhone, body: windowRes.reason })
    );
    return;
  }

  const availableWindows = windowRes.windows.filter(w => w.status === "AVAILABLE");

  if (availableWindows.length === 0) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "No sessions available for this date. Please try another date.",
      })
    );
    return;
  }

  await ensureConversationRow(admin, salon.id, customerPhone, "SELECTING_SESSION", {
    ...ctx,
    selectedDayIso: day.toISOString(),
  });

  const buttons = availableWindows.map((w) => ({
    id: `session_${w.name.toLowerCase()}`,
    title: w.name,
  }));

  const textLines = availableWindows.map(w => `• ${w.name} (${w.range})`);
  
  await sendAuth(salon, (pid, tok) =>
    sendWhatsAppButtons(pid, tok, {
      toE164: customerPhone,
      bodyText: `Available sessions:\n${textLines.join("\n")}\n\nTap a session or reply with "Morning" or "Evening".`,
      buttons,
    })
  );
}

async function handleSelectingSession(
  admin: SupabaseClient<Database>,
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
    await ensureConversationRow(admin, salon.id, customerPhone, "IDLE", {});
    await startIdleFlow(admin, salon, customerPhone);
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
  const { data: services } = await admin
    .from("services")
    .select("duration_minutes")
    .in("id", ids);

  const totalDur = services?.reduce((a, s) => a + s.duration_minutes, 0) ?? 0;

  const windowRes = await getAvailableWindows(admin, salon.id, day, totalDur);
  if (!windowRes.ok) {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, { toE164: customerPhone, body: windowRes.reason })
    );
    return;
  }

  const selectedWindow = windowRes.windows.find(w => w.name.toLowerCase() === sessionChoice);
  if (!selectedWindow || selectedWindow.status !== "AVAILABLE") {
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "That session is no longer available. Please pick another one or try a different date.",
      })
    );
    return;
  }

  const { data: busyRows } = await admin
    .from("appointments")
    .select("end_time")
    .eq("salon_id", salon.id)
    .in("status", ["pending", "confirmed"])
    .gte("start_time", selectedWindow.startUtc.toISOString())
    .lt("start_time", selectedWindow.endUtc.toISOString())
    .order("end_time", { ascending: false })
    .limit(1);

  let assignedStartUtc = selectedWindow.startUtc;
  if (busyRows && busyRows.length > 0) {
    const lastEndTime = parseISO(busyRows[0].end_time);
    assignedStartUtc = addMinutes(lastEndTime, APPOINTMENT_BUFFER_MINUTES);
  }

  await ensureConversationRow(admin, salon.id, customerPhone, "CONFIRMING_NAME", {
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
  admin: SupabaseClient<Database>,
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
    await ensureConversationRow(admin, salon.id, customerPhone, "IDLE", {});
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Something went wrong. Let's start over — sending services.",
      })
    );
    await startIdleFlow(admin, salon, customerPhone);
    return;
  }

  const startIso = starts[slotIdx - 1]!;
  const startTime = parseISO(startIso);

  const { data: svcRows, error: se } = await admin
    .from("services")
    .select("id, name, duration_minutes, price")
    .in("id", ids);
  if (se || !svcRows?.length) {
    console.error(se?.message);
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

  const { data: existing } = await admin
    .from("customers")
    .select("id, name")
    .eq("salon_id", salon.id)
    .eq("phone", customerPhone)
    .maybeSingle();

  let customerId = existing?.id;
  if (existing) {
    await admin
      .from("customers")
      .update({ name })
      .eq("id", existing.id);
  } else {
    const { data: created, error: ce } = await admin
      .from("customers")
      .insert({
        salon_id: salon.id,
        phone: customerPhone,
        name,
      })
      .select("id")
      .single();
    if (ce || !created) {
      console.error(ce?.message);
      await sendAuth(salon, (pid, tok) =>
        sendWhatsAppText(pid, tok, {
          toE164: customerPhone,
          body: "Could not save customer. Try again.",
        })
      );
      return;
    }
    customerId = created.id;
  }

  const { data: apt, error: ae } = await admin
    .from("appointments")
    .insert({
      salon_id: salon.id,
      customer_id: customerId!,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      total_duration_minutes: totalDur,
      total_price: totalPrice,
      status: "confirmed",
      reminder_sent: false,
    })
    .select("id")
    .single();

  if (ae || !apt) {
    console.error(ae?.message);
    await sendAuth(salon, (pid, tok) =>
      sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "Could not create booking. Try another slot.",
      })
    );
    return;
  }

  for (const s of svcRows) {
    await admin.from("appointment_services").insert({
      appointment_id: apt.id,
      service_id: s.id,
      price_at_booking: Number(s.price),
      duration_at_booking: s.duration_minutes,
    });
  }

  await admin.from("notifications").insert({
    salon_id: salon.id,
    type: "new_booking",
    appointment_id: apt.id,
    is_read: false,
  });

  await ensureConversationRow(admin, salon.id, customerPhone, "BOOKED", {});

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
