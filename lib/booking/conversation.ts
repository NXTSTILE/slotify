import { addMinutes, format, parseISO, startOfDay } from "date-fns";
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
  findEarliestSlotStart,
  combineKolkataDateAndTime,
} from "@/lib/booking/slots";
import { assignQueue } from "@/lib/booking/queueAssignment";
import {
  sendWhatsAppText,
  sendWhatsAppList,
  sendWhatsAppButtons,
} from "@/lib/whatsapp/send";

const CtxSchema = z.object({
  gender: z.enum(["male", "female"]).optional(),
  selectedDayIso: z.string().optional(),
  selectedSession: z.string().optional(),
  selectedServiceGroups: z.array(z.string().uuid()).optional(),
  currentGroupIndex: z.number().int().optional(),
  subserviceIds: z.array(z.string().uuid()).optional(),
  confirmedAppointmentId: z.string().uuid().optional(),
  assignedQueueId: z.string().uuid().optional(),
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

function isGreeting(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!.,?]+$/, "");
  return ["hi", "hii", "hiii", "hello", "hey", "helo", "hai", "start"].includes(t);
}

async function ensureConversationRow(salonId: string, phone: string, state: string, ctx: Ctx): Promise<void> {
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

async function getState(salonId: string, phone: string): Promise<{ state: string; ctx: Ctx }> {
  try {
    const res = await db.query(
      "SELECT state, context FROM public.conversation_states WHERE salon_id = $1 AND customer_phone = $2 LIMIT 1",
      [salonId, phone]
    );
    if (res.rows.length === 0) return { state: "IDLE", ctx: {} };
    return { state: res.rows[0].state, ctx: parseContext(res.rows[0].context) };
  } catch (err: any) {
    return { state: "IDLE", ctx: {} };
  }
}

function tokenizeKeywords(text: string): string | null {
  const t = text.trim().toUpperCase();
  const map: Record<string, string> = {
    HELP: "HELP", PRICE: "SERVICES", SERVICES: "SERVICES", LOCATION: "LOCATION",
    HOURS: "HOURS", CONTACT: "CONTACT", POLICY: "POLICY", BOOK: "BOOK",
  };
  return map[t] ?? null;
}

async function sendAuth(salon: SalonRow, fn: (pid: string, token: string) => Promise<{ ok: boolean; error?: string }>) {
  const pid = salon.whatsapp_phone_number_id;
  const token = salon.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!pid || !token) {
    console.error("[conversation] Missing WhatsApp credentials for salon", salon.id);
    return;
  }
  await fn(pid, token);
}

async function findActiveAppointment(salonId: string, customerPhone: string) {
  try {
    const custRes = await db.query("SELECT id FROM public.customers WHERE salon_id = $1 AND phone = $2 LIMIT 1", [salonId, customerPhone]);
    if (custRes.rows.length === 0) return null;
    const aptRes = await db.query(
      `SELECT id, start_time, status, total_price, total_duration_minutes 
       FROM public.appointments 
       WHERE salon_id = $1 AND customer_id = $2 AND is_deleted = false AND status = 'confirmed'
       ORDER BY start_time DESC LIMIT 1`,
      [salonId, custRes.rows[0].id]
    );
    return aptRes.rows[0] || null;
  } catch (err: any) {
    return null;
  }
}

function formatBookingDetail(salonName: string, startIso: string | Date, durationMin: number, price: number, status: string): string {
  const st = typeof startIso === "string" ? parseISO(startIso) : startIso;
  const local = toZonedTime(st, SALON_TIMEZONE);
  return `*${salonName}*\nWhen: ${format(local, "EEE, dd MMM yyyy 'at' hh:mm a")} (${SALON_TIMEZONE})\nDuration: ${durationMin} min\nPrice: ₹${Number(price).toFixed(2)}\nStatus: ${status}`;
}

async function cancelAppointmentById(salonId: string, appointmentId: string, customerPhone: string) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE public.appointments SET status = 'cancelled' WHERE id = $1 AND salon_id = $2", [appointmentId, salonId]);
    await client.query("INSERT INTO public.notifications (salon_id, type, appointment_id, is_read) VALUES ($1, 'cancellation', $2, false)", [salonId, appointmentId]);
    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  const salon = await loadSalon(salonId);
  await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "Your appointment has been cancelled. Send *hi* to start a new booking." }));
}

async function loadSalon(salonId: string): Promise<SalonRow> {
  const res = await db.query(`SELECT id, name, phone, address, city, cancellation_policy, whatsapp_phone_number_id, whatsapp_access_token FROM public.salons WHERE id = $1 AND is_deleted = false LIMIT 1`, [salonId]);
  if (res.rows.length === 0) throw new Error("Salon not found");
  return res.rows[0] as SalonRow;
}

export async function handleConversationMessage(salonId: string, customerPhoneRaw: string, incoming: IncomingParsed): Promise<void> {
  const customerPhone = normalizeCustomerPhone(customerPhoneRaw);
  const salon = await loadSalon(salonId);
  const userText = incoming.kind === "text" ? incoming.body.trim() : "";
  const { state, ctx } = await getState(salonId, customerPhone);
  const kw = tokenizeKeywords(userText);

  if (incoming.kind === "text" && isGreeting(userText)) {
    await ensureConversationRow(salonId, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }

  if (kw === "HELP") {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `*🛠️ Help & Commands*\n\n*SERVICES* — 📋 List services\n*LOCATION* — 📍 Address\n*HOURS* — 🕒 Hours\n*CONTACT* — 📞 Phone\n*POLICY* — 📜 Policy\n\n_Send *hi* to start a new booking._` }));
    return;
  }
  if (kw === "SERVICES") { await sendServiceCatalog(salon, customerPhone); return; }
  if (kw === "LOCATION") { await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `📍 *Our Location:*\n${[salon.address, salon.city].filter(Boolean).join(", ") || "Not set"}` })); return; }
  if (kw === "CONTACT") { await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `📞 *Contact Us:*\n${salon.phone}` })); return; }
  if (kw === "POLICY") { await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `📜 *Cancellation Policy:*\n${salon.cancellation_policy || "None"}` })); return; }
  if (kw === "HOURS") { await sendWorkingHoursSummary(salon, customerPhone); return; }

  if (kw === "BOOK") {
    await ensureConversationRow(salonId, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }

  if (state === "BOOKED") {
    const apt = await findActiveAppointment(salonId, customerPhone);
    if (apt) {
      await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `${formatBookingDetail(salon.name, apt.start_time, apt.total_duration_minutes, Number(apt.total_price), apt.status)}\n\n_Send *hi* to make a new booking._` }));
    } else {
      await ensureConversationRow(salonId, customerPhone, "IDLE", {});
    }
    return;
  }

  switch (state) {
    case "IDLE":
      // Ignore unknown messages in idle
      break;
    case "SELECTING_GENDER":
      await handleSelectingGender(salon, customerPhone, incoming, ctx);
      break;
    case "SELECTING_DATE_SESSION":
      await handleSelectingDateSession(salon, customerPhone, incoming, ctx);
      break;
    case "SELECTING_SERVICE_GROUPS":
      await handleSelectingServiceGroups(salon, customerPhone, userText, ctx);
      break;
    case "SELECTING_SUBSERVICES":
      await handleSelectingSubservices(salon, customerPhone, userText, ctx);
      break;
    case "ASKING_LOCATION":
      await handleAskingLocation(salon, customerPhone, incoming, ctx);
      break;
    case "CONFIRMING_NAME":
      await handleConfirmingName(salon, customerPhone, userText, ctx);
      break;
    default:
      await ensureConversationRow(salonId, customerPhone, "IDLE", {});
  }
}

async function sendGenderMenu(salon: SalonRow, customerPhone: string) {
  await sendAuth(salon, (pid, tok) => sendWhatsAppButtons(pid, tok, {
    toE164: customerPhone,
    bodyText: `👋 Welcome to *${salon.name}*!\n\nTo help us show you the most relevant services, please select your gender:`,
    buttons: [{ id: "btn_male", title: "👨 Male" }, { id: "btn_female", title: "👩 Female" }],
  }));
}

async function sendDateSessionList(salon: SalonRow, customerPhone: string) {
  const today = resolveDate("today");
  const tomorrow = resolveDate("tomorrow");

  const todayWindows = await getAvailableWindows(salon.id, today, 15, true);
  const tomorrowWindows = await getAvailableWindows(salon.id, tomorrow, 15, true);

  let todayMorningRange = "Morning";
  let todayEveningRange = "Evening";
  let tomorrowMorningRange = "Morning";
  let tomorrowEveningRange = "Evening";

  if (todayWindows.ok) {
    const m = todayWindows.windows.find(w => w.name === "Morning");
    const e = todayWindows.windows.find(w => w.name === "Evening");
    if (m) todayMorningRange = `Morning (${m.range})`;
    if (e) todayEveningRange = `Evening (${e.range})`;
  }
  if (tomorrowWindows.ok) {
    const m = tomorrowWindows.windows.find(w => w.name === "Morning");
    const e = tomorrowWindows.windows.find(w => w.name === "Evening");
    if (m) tomorrowMorningRange = `Morning (${m.range})`;
    if (e) tomorrowEveningRange = `Evening (${e.range})`;
  }

  await sendAuth(salon, (pid, tok) => sendWhatsAppList(pid, tok, {
    toE164: customerPhone,
    bodyText: "📅 When would you like to schedule your visit?",
    buttonText: "Select Time",
    sections: [
      {
        title: "Today",
        rows: [
          { id: "ds_today_morning", title: todayMorningRange },
          { id: "ds_today_evening", title: todayEveningRange }
        ]
      },
      {
        title: "Tomorrow",
        rows: [
          { id: "ds_tomorrow_morning", title: tomorrowMorningRange },
          { id: "ds_tomorrow_evening", title: tomorrowEveningRange }
        ]
      }
    ]
  }));
}

async function sendServiceCatalog(salon: SalonRow, to: string, gender?: "male" | "female") {
  await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: to, body: `Please use the booking flow by sending *hi* to view our specific services and prices.` }));
}

async function sendWorkingHoursSummary(salon: SalonRow, to: string) {
  await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: to, body: `Send *hi* to start booking and see availability.` }));
}

async function handleSelectingGender(salon: SalonRow, customerPhone: string, incoming: IncomingParsed, ctx: Ctx) {
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
  await ensureConversationRow(salon.id, customerPhone, "SELECTING_DATE_SESSION", { gender });
  await sendDateSessionList(salon, customerPhone);
}

function resolveDate(t: string): Date {
  const z = toZonedTime(new Date(), SALON_TIMEZONE);
  const iso = `${format(z, "yyyy-MM-dd")}T00:00:00+05:30`;
  const day = parseISO(iso);
  if (t === "tomorrow") return addMinutes(day, 24 * 60);
  return day;
}

async function handleSelectingDateSession(salon: SalonRow, customerPhone: string, incoming: IncomingParsed, ctx: Ctx) {
  if (incoming.kind !== "interactive" || !incoming.id.startsWith("ds_")) {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "Please tap the 'Select Time' button to choose." }));
    return;
  }
  const parts = incoming.id.replace("ds_", "").split("_");
  const dayText = parts[0]; // "today" | "tomorrow"
  const sessionChoice = parts[1]; // "morning" | "evening"

  const day = resolveDate(dayText);
  const windowRes = await getAvailableWindows(salon.id, day, 15, true);

  if (!windowRes.ok) {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `⚠️ ${windowRes.reason}` }));
    await sendDateSessionList(salon, customerPhone);
    return;
  }

  const w = windowRes.windows.find(x => x.name.toLowerCase() === sessionChoice);
  if (!w || w.status !== "AVAILABLE") {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `⚠️ The ${sessionChoice} session on ${dayText} is fully booked or closed. Please select another.` }));
    await sendDateSessionList(salon, customerPhone);
    return;
  }

  await ensureConversationRow(salon.id, customerPhone, "SELECTING_SERVICE_GROUPS", {
    ...ctx,
    selectedDayIso: day.toISOString(),
    selectedSession: sessionChoice,
  });

  const res = await db.query(
    `SELECT DISTINCT s.id, s.name, s.display_order 
     FROM public.services s
     JOIN public.subservices sub ON sub.service_id = s.id
     WHERE s.salon_id = $1 
       AND sub.is_active = true 
       AND (s.gender_tag = $2 OR s.gender_tag = 'unisex')
       AND (sub.gender_tag = $2 OR sub.gender_tag = 'unisex')
     ORDER BY s.display_order ASC`,
    [salon.id, ctx.gender || "unisex"]
  );
  const groups = res.rows;
  if (!groups.length) {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "No services available right now." }));
    return;
  }

  const catalog = groups.map((g, i) => `${i + 1}. ${g.name}`).join("\n");
  await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, {
    toE164: customerPhone,
    body: `📌 *Please choose the service categories you'd like:*\n\n${catalog}\n\nReply with numbers (e.g. *1* or *1,2*)`,
  }));
}

async function handleSelectingServiceGroups(salon: SalonRow, customerPhone: string, userText: string, ctx: Ctx) {
  const res = await db.query(
    `SELECT DISTINCT s.id, s.name, s.display_order 
     FROM public.services s
     JOIN public.subservices sub ON sub.service_id = s.id
     WHERE s.salon_id = $1 
       AND sub.is_active = true 
       AND (s.gender_tag = $2 OR s.gender_tag = 'unisex')
       AND (sub.gender_tag = $2 OR sub.gender_tag = 'unisex')
     ORDER BY s.display_order ASC`,
    [salon.id, ctx.gender || "unisex"]
  );
  const groups = res.rows;
  
  const parts = userText.split(/[\s,\/]+/).map(x => x.trim()).filter(Boolean);
  const selectedGroupIds: string[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n) || n < 1 || n > groups.length) continue;
    selectedGroupIds.push(groups[n - 1].id);
  }

  if (selectedGroupIds.length === 0) {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "Please reply with valid numbers from the list." }));
    return;
  }

  await ensureConversationRow(salon.id, customerPhone, "SELECTING_SUBSERVICES", {
    ...ctx,
    selectedServiceGroups: selectedGroupIds,
    currentGroupIndex: 0,
    subserviceIds: [],
  });

  await promptNextSubservice(salon, customerPhone, selectedGroupIds, 0, ctx.gender!);
}

async function promptNextSubservice(salon: SalonRow, customerPhone: string, groups: string[], index: number, gender: string) {
  if (index >= groups.length) {
    // Should transition out if completed via standard flow
    return;
  }
  const groupId = groups[index];
  const gRes = await db.query("SELECT name FROM public.services WHERE id = $1", [groupId]);
  const gName = gRes.rows[0].name;

  const res = await db.query(
    "SELECT id, name, duration_minutes, price, tier FROM public.subservices WHERE salon_id = $1 AND service_id = $2 AND is_active = true AND (gender_tag = $3 OR gender_tag = 'unisex') ORDER BY display_order ASC",
    [salon.id, groupId, gender]
  );
  
  if (res.rows.length === 0) {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: `No options available under *${gName}*. Type *skip* to continue.` }));
    return;
  }

  const catalog = res.rows.map((s, i) => {
    const tStr = s.tier ? ` - ${s.tier}` : "";
    return `${i + 1}. ${s.name}${tStr} (₹${Number(s.price).toFixed(2)})`;
  }).join("\n");

  await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, {
    toE164: customerPhone,
    body: `📌 *Select options for ${gName}:*\n\n${catalog}\n\nReply with numbers (e.g. *1* or *1,2*). Type *skip* if you don't need any.`,
  }));
}

async function handleSelectingSubservices(salon: SalonRow, customerPhone: string, userText: string, ctx: Ctx) {
  const groups = ctx.selectedServiceGroups || [];
  const currentIndex = ctx.currentGroupIndex || 0;
  if (currentIndex >= groups.length) return;

  const groupId = groups[currentIndex];
  const t = userText.trim().toLowerCase();
  
  const selectedSubs = ctx.subserviceIds || [];

  if (t !== "skip" && t !== "done" && t !== "no") {
    const res = await db.query(
      "SELECT id FROM public.subservices WHERE salon_id = $1 AND service_id = $2 AND is_active = true AND (gender_tag = $3 OR gender_tag = 'unisex') ORDER BY display_order ASC",
      [salon.id, groupId, ctx.gender]
    );
    const subservices = res.rows;
    
    const parts = userText.split(/[\s,\/]+/).map(x => x.trim()).filter(Boolean);
    let pickedAny = false;
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 1 || n > subservices.length) continue;
      selectedSubs.push(subservices[n - 1].id);
      pickedAny = true;
    }
    if (!pickedAny) {
      await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "Please reply with valid numbers or type *skip*." }));
      return;
    }
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex < groups.length) {
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_SUBSERVICES", {
      ...ctx,
      currentGroupIndex: nextIndex,
      subserviceIds: selectedSubs,
    });
    await promptNextSubservice(salon, customerPhone, groups, nextIndex, ctx.gender!);
  } else {
    // All done
    if (selectedSubs.length === 0) {
      await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "⚠️ You haven't selected any services. Let's start over." }));
      await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
      await sendGenderMenu(salon, customerPhone);
      return;
    }

    // Book it
    const svcRes = await db.query("SELECT id, duration_minutes, price, name FROM public.subservices WHERE id = ANY($1::uuid[])", [selectedSubs]);
    const list = svcRes.rows;
    const totalDur = list.reduce((a, s) => a + s.duration_minutes, 0);
    const totalPrice = list.reduce((a, s) => a + Number(s.price), 0);

    const day = parseISO(ctx.selectedDayIso!);
    const windowRes = await getAvailableWindows(salon.id, day, totalDur, true);
    if (!windowRes.ok) {
      await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: windowRes.reason }));
      return;
    }
    const selectedWindow = windowRes.windows.find(w => w.name.toLowerCase() === ctx.selectedSession);
    if (!selectedWindow || selectedWindow.status !== "AVAILABLE") {
      await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "⚠️ The session is fully booked. Please restart." }));
      return;
    }

    // Assign to the best available queue (earliest gap)
    let assignedStartUtc: Date | null = null;
    let assignedQueueId: string | undefined;

    // Load active queues
    const queueRes = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM public.queues WHERE salon_id = $1 AND is_active = true ORDER BY name ASC",
      [salon.id]
    );
    const activeQueues = queueRes.rows;

    const isMorning = ctx.selectedSession === "morning";
    const zonedDay = toZonedTime(day, SALON_TIMEZONE);
    const dayOfWeek = zonedDay.getDay();
    const whRes = await db.query(
      "SELECT close_time, break_end_time FROM public.working_hours WHERE salon_id = $1 AND day_of_week = $2 LIMIT 1",
      [salon.id, dayOfWeek]
    );
    const wh = whRes.rows[0];
    const closeTimeStr = wh?.close_time || "21:00:00";
    
    // Combine date and time to get closeUtc
    const dayStartLocal = startOfDay(zonedDay);
    const dayStartUtc = parseISO(`${format(dayStartLocal, "yyyy-MM-dd")}T00:00:00+05:30`);
    const closeUtc = combineKolkataDateAndTime(dayStartUtc, closeTimeStr);

    if (activeQueues.length > 0) {
      let bestQueueId: string | null = null;
      let earliestStart: Date = new Date(8640000000000000); // sentinel

      for (const queue of activeQueues) {
        const qStart = await findEarliestSlotStart(
          salon.id,
          queue.id,
          selectedWindow.startUtc,
          selectedWindow.endUtc,
          totalDur,
          isMorning,
          closeUtc
        );
        if (qStart && qStart < earliestStart) {
          earliestStart = qStart;
          bestQueueId = queue.id;
        }
      }

      if (bestQueueId) {
        assignedStartUtc = earliestStart;
        assignedQueueId = bestQueueId;
      }
    } else {
      // No queues configured - single timeline
      assignedStartUtc = await findEarliestSlotStart(
        salon.id,
        null,
        selectedWindow.startUtc,
        selectedWindow.endUtc,
        totalDur,
        isMorning,
        closeUtc
      );
    }

    if (!assignedStartUtc) {
      assignedStartUtc = selectedWindow.startUtc;
    }

    // Check if booking is for today in the salon timezone — ask location only if queue is empty
    const zonedNow = toZonedTime(new Date(), SALON_TIMEZONE);
    const todayStr = format(zonedNow, "yyyy-MM-dd");
    const selectedDayStr = format(toZonedTime(day, SALON_TIMEZONE), "yyyy-MM-dd");
    const isToday = todayStr === selectedDayStr;

    let shouldAskLocation = false;
    if (isToday) {
      const dayStartBound = startOfDay(toZonedTime(day, SALON_TIMEZONE));
      const dayStartUtcBound = parseISO(`${format(dayStartBound, "yyyy-MM-dd")}T00:00:00+05:30`);
      const dayEndUtcBound = addMinutes(dayStartUtcBound, 24 * 60);

      const busyRes = await db.query(
        `SELECT COUNT(*) as cnt
         FROM public.appointments 
         WHERE salon_id = $1 
           AND (queue_id = $2 OR (queue_id IS NULL AND $2 IS NULL))
           AND is_deleted = false 
           AND status = 'confirmed'
           AND start_time >= $3 
           AND start_time < $4`,
        [salon.id, assignedQueueId || null, dayStartUtcBound.toISOString(), dayEndUtcBound.toISOString()]
      );

      // Only ask if the queue is completely empty for the day
      if (Number(busyRes.rows[0]?.cnt ?? 0) === 0) {
        shouldAskLocation = true;
      }
    }

    if (shouldAskLocation) {
      await ensureConversationRow(salon.id, customerPhone, "ASKING_LOCATION", {
        ...ctx,
        subserviceIds: selectedSubs,
        assignedQueueId: assignedQueueId || undefined,
      });
      await sendLocationMenu(salon, customerPhone);
      return;
    }

    const endTime = addMinutes(assignedStartUtc, totalDur + APPOINTMENT_BUFFER_MINUTES);

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // Upsert customer
      let customerId: string;
      const custRes = await client.query("SELECT id FROM public.customers WHERE salon_id = $1 AND phone = $2 LIMIT 1", [salon.id, customerPhone]);
      if (custRes.rows.length > 0) {
        customerId = custRes.rows[0].id;
      } else {
        const ins = await client.query("INSERT INTO public.customers (salon_id, phone, name) VALUES ($1, $2, $3) RETURNING id", [salon.id, customerPhone, ""]);
        customerId = ins.rows[0].id;
      }

      // Insert appointment directly as confirmed — first come first served
      const aptInsert = await client.query(
        `INSERT INTO public.appointments (salon_id, customer_id, start_time, end_time, total_duration_minutes, total_price, status, reminder_sent, queue_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', false, $7) RETURNING id`,
        [salon.id, customerId, assignedStartUtc.toISOString(), endTime.toISOString(), totalDur, totalPrice, assignedQueueId ?? null]
      );
      const appointmentId = aptInsert.rows[0].id;

      for (const svc of list) {
        await client.query(
          `INSERT INTO public.appointment_services (appointment_id, service_id, price_at_booking, duration_at_booking) VALUES ($1, $2, $3, $4)`,
          [appointmentId, svc.id, Number(svc.price), svc.duration_minutes]
        );
      }

      await client.query("COMMIT");
      client.release();

      await ensureConversationRow(salon.id, customerPhone, "CONFIRMING_NAME", {
        ...ctx, subserviceIds: selectedSubs, confirmedAppointmentId: appointmentId, assignedQueueId,
      });

      const timeStr = format(toZonedTime(assignedStartUtc, SALON_TIMEZONE), "hh:mm a");
      const svcSummary = list.map((s) => `• ${s.name}`).join("\n");
      await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: `✅ *Your slot is confirmed!*\n\n*Services:*\n${svcSummary}\n\n*When:* ${timeStr}\n*Total:* ₹${totalPrice.toFixed(2)}\n\n✍️ *Please reply with your full name to complete booking:*`,
      }));
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      console.error("[conversation] booking insert failed", err.message);
      await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, {
        toE164: customerPhone,
        body: "⚠️ Sorry, we couldn't complete your booking due to a system error. Please try again.",
      }));
    }
  }
}

async function handleConfirmingName(salon: SalonRow, customerPhone: string, body: string, ctx: Ctx) {
  const name = body.trim();
  if (name.length < 2) {
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, { toE164: customerPhone, body: "⚠️ *Name required*\nPlease reply with your full name." }));
    return;
  }
  const appointmentId = ctx.confirmedAppointmentId;
  if (!appointmentId) {
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }

  const checkRes = await db.query(
    `SELECT start_time, total_price FROM public.appointments WHERE id = $1 AND salon_id = $2 AND status = 'confirmed' LIMIT 1`,
    [appointmentId, salon.id]
  );
  if (checkRes.rows.length === 0) {
    // Appointment no longer exists — restart
    await ensureConversationRow(salon.id, customerPhone, "SELECTING_GENDER", {});
    await sendGenderMenu(salon, customerPhone);
    return;
  }
  const apt = checkRes.rows[0];

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE public.customers SET name = $1 WHERE salon_id = $2 AND phone = $3", [name, salon.id, customerPhone]);
    await client.query("INSERT INTO public.notifications (salon_id, type, appointment_id, is_read) VALUES ($1, 'new_booking', $2, false)", [salon.id, appointmentId]);
    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
    client.release();
    console.error("[conversation] name confirmation failed", err.message);
    return;
  }
  client.release();

  await ensureConversationRow(salon.id, customerPhone, "BOOKED", {});
  const svcRes = await db.query(`SELECT s.name FROM public.appointment_services as2 JOIN public.subservices s ON s.id = as2.service_id WHERE as2.appointment_id = $1`, [appointmentId]);
  
  await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, {
    toE164: customerPhone,
    body: `🎉 *Booking Confirmed!*\n\n*Services:*\n${svcRes.rows.map((s) => `• ${s.name}`).join("\n")}\n\n*Date/Time:*\n📅 ${format(toZonedTime(new Date(apt.start_time), SALON_TIMEZONE), "EEE dd MMM, hh:mm a")}\n\n👤 ${name}\n\n_Send *hi* to make another booking._`
  }));
}

async function sendLocationMenu(salon: SalonRow, customerPhone: string) {
  await sendAuth(salon, (pid, tok) => sendWhatsAppButtons(pid, tok, {
    toE164: customerPhone,
    bodyText: `📍 We noticed the salon queue is currently empty!\n\nAre you already at the salon, or are you booking from home/want to come later?`,
    buttons: [
      { id: "loc_salon", title: "📍 At the salon" },
      { id: "loc_home", title: "🏠 At home / later" }
    ]
  }));
}

async function handleAskingLocation(salon: SalonRow, customerPhone: string, incoming: IncomingParsed, ctx: Ctx) {
  let choice: "salon" | "home" | null = null;
  if (incoming.kind === "interactive") {
    if (incoming.id === "loc_salon") choice = "salon";
    else if (incoming.id === "loc_home") choice = "home";
  } else if (incoming.kind === "text") {
    const t = incoming.body.trim().toLowerCase();
    if (t.includes("salon") || t.includes("at salon") || t.includes("here")) choice = "salon";
    else if (t.includes("home") || t.includes("later") || t.includes("house")) choice = "home";
  }
  if (!choice) {
    await sendLocationMenu(salon, customerPhone);
    return;
  }

  const selectedSubs = ctx.subserviceIds || [];
  const svcRes = await db.query("SELECT id, duration_minutes, price, name FROM public.subservices WHERE id = ANY($1::uuid[])", [selectedSubs]);
  const list = svcRes.rows;
  const totalDur = list.reduce((a, s) => a + s.duration_minutes, 0);
  const totalPrice = list.reduce((a, s) => a + Number(s.price), 0);

  // Determine start time based on customer's physical location
  let assignedStartUtc: Date;
  if (choice === "salon") {
    assignedStartUtc = new Date(); // they are already there
  } else {
    assignedStartUtc = addMinutes(new Date(), 20); // 20-min travel buffer
  }

  // Assign to best available queue from the target start time
  const queueResult = await assignQueue(salon.id, assignedStartUtc, totalDur);
  let assignedQueueId = ctx.assignedQueueId;
  if (queueResult) {
    // Use queue's earliest available slot, but not before the customer's target time
    assignedStartUtc = queueResult.assignedStartUtc < assignedStartUtc ? assignedStartUtc : queueResult.assignedStartUtc;
    assignedQueueId = queueResult.queueId;
  } else {
    // No queues configured — use salon-level single timeline
    const busyRes = await db.query(
      `SELECT end_time FROM public.appointments WHERE salon_id = $1 AND is_deleted = false AND status = 'confirmed' AND start_time >= $2 AND start_time < $3 ORDER BY end_time DESC LIMIT 1`,
      [salon.id, assignedStartUtc.toISOString(), addMinutes(assignedStartUtc, 24 * 60).toISOString()]
    );
    if (busyRes.rows.length > 0) {
      const busyEnd = parseISO(busyRes.rows[0].end_time);
      if (busyEnd > assignedStartUtc) {
        assignedStartUtc = addMinutes(busyEnd, APPOINTMENT_BUFFER_MINUTES);
      }
    }
  }

  const endTime = addMinutes(assignedStartUtc, totalDur + APPOINTMENT_BUFFER_MINUTES);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    let customerId: string;
    const custRes = await client.query("SELECT id FROM public.customers WHERE salon_id = $1 AND phone = $2 LIMIT 1", [salon.id, customerPhone]);
    if (custRes.rows.length > 0) {
      customerId = custRes.rows[0].id;
    } else {
      const ins = await client.query("INSERT INTO public.customers (salon_id, phone, name) VALUES ($1, $2, $3) RETURNING id", [salon.id, customerPhone, ""]);
      customerId = ins.rows[0].id;
    }

    // Insert directly as confirmed — first come first served
    const aptInsert = await client.query(
      `INSERT INTO public.appointments (salon_id, customer_id, start_time, end_time, total_duration_minutes, total_price, status, reminder_sent, queue_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', false, $7) RETURNING id`,
      [salon.id, customerId, assignedStartUtc.toISOString(), endTime.toISOString(), totalDur, totalPrice, assignedQueueId ?? null]
    );
    const appointmentId = aptInsert.rows[0].id;

    for (const svc of list) {
      await client.query(
        `INSERT INTO public.appointment_services (appointment_id, service_id, price_at_booking, duration_at_booking) VALUES ($1, $2, $3, $4)`,
        [appointmentId, svc.id, Number(svc.price), svc.duration_minutes]
      );
    }

    await client.query("COMMIT");
    client.release();

    await ensureConversationRow(salon.id, customerPhone, "CONFIRMING_NAME", {
      ...ctx, subserviceIds: selectedSubs, confirmedAppointmentId: appointmentId, assignedQueueId,
    });

    const timeStr = format(toZonedTime(assignedStartUtc, SALON_TIMEZONE), "hh:mm a");
    const svcSummary = list.map((s) => `• ${s.name}`).join("\n");
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body: `✅ *Your slot is confirmed!*\n\n*Services:*\n${svcSummary}\n\n*When:* ${timeStr}\n*Total:* ₹${totalPrice.toFixed(2)}\n\n✍️ *Please reply with your full name to complete booking:*`,
    }));
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    console.error("[conversation] location-path booking insert failed", err.message);
    await sendAuth(salon, (pid, tok) => sendWhatsAppText(pid, tok, {
      toE164: customerPhone,
      body: "⚠️ Sorry, we couldn't complete your booking due to a system error. Please try again.",
    }));
  }
}
