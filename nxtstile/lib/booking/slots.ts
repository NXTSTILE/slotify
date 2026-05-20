import { addMinutes, format, isBefore, isSameDay, parseISO, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  APPOINTMENT_BUFFER_MINUTES,
  MAX_BOOKING_DAYS_AHEAD,
  SAME_DAY_MIN_LEAD_HOURS,
  SALON_TIMEZONE,
} from "@/lib/constants";

/** Parse DD/MM/YYYY to UTC Date representing start of that calendar day in Kolkata */
export function parseDdMmYyyyKolkata(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return parseISO(`${iso}T00:00:00+05:30`);
}

export function formatSlotLabel(utc: Date): string {
  const local = toZonedTime(utc, SALON_TIMEZONE);
  return format(local, "hh:mm a");
}

function combineKolkataDateAndTime(dayUtc: Date, timeHHMMSS: string): Date {
  const local = toZonedTime(dayUtc, SALON_TIMEZONE);
  const [h, mi, se] = timeHHMMSS.split(":").map((x) => Number(x));
  const y = local.getFullYear();
  const mo = local.getMonth();
  const d = local.getDate();
  const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(se ?? 0).padStart(2, "0")}+05:30`;
  return parseISO(iso);
}

function addMinutesUtc(d: Date, mins: number): Date {
  return addMinutes(d, mins);
}

export type SlotResult =
  | { ok: true; slots: { index: number; startUtc: Date; label: string }[] }
  | { ok: false; reason: string };

/**
 * Available 5-minute slot starts for booking.
 * totalDurationMinutes: sum of service durations (multiple of 5).
 */
export async function getAvailableSlots(
  admin: SupabaseClient<Database>,
  salonId: string,
  selectedDayUtc: Date,
  totalDurationMinutes: number,
  bufferMinutes: number = APPOINTMENT_BUFFER_MINUTES
): Promise<SlotResult> {
  const now = new Date();
  const zonedDay = toZonedTime(selectedDayUtc, SALON_TIMEZONE);
  const dayStartLocal = startOfDay(zonedDay);
  const dayStartUtc = parseISO(
    `${format(dayStartLocal, "yyyy-MM-dd")}T00:00:00+05:30`
  );

  const dayEndExclusiveUtc = addMinutesUtc(dayStartUtc, 24 * 60);

  if (isBefore(dayEndExclusiveUtc, now)) {
    return { ok: false, reason: "That date is in the past." };
  }

  const maxDate = addMinutesUtc(now, MAX_BOOKING_DAYS_AHEAD * 24 * 60);
  if (isBefore(maxDate, dayStartUtc)) {
    return { ok: false, reason: `Bookings are only available within ${MAX_BOOKING_DAYS_AHEAD} days.` };
  }

  const dayOfWeek = zonedDay.getDay();

  const { data: holiday, error: holErr } = await admin
    .from("holidays")
    .select("id")
    .eq("salon_id", salonId)
    .eq("date", format(zonedDay, "yyyy-MM-dd"))
    .maybeSingle();

  if (holErr) {
    console.error("[slots] holiday query", holErr.message);
    return { ok: false, reason: "Could not check holidays. Try again." };
  }
  if (holiday) {
    return { ok: false, reason: "We are closed on that date." };
  }

  const { data: wh, error: whErr } = await admin
    .from("working_hours")
    .select("open_time, close_time, is_closed")
    .eq("salon_id", salonId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  if (whErr || !wh) {
    if (whErr) console.error("[slots] working_hours", whErr.message);
    return { ok: false, reason: "Working hours are not set for that day." };
  }
  if (wh.is_closed || !wh.open_time || !wh.close_time) {
    return { ok: false, reason: "We are closed that day." };
  }

  const openUtc = combineKolkataDateAndTime(dayStartUtc, wh.open_time);
  const closeUtc = combineKolkataDateAndTime(dayStartUtc, wh.close_time);

  if (!isBefore(openUtc, closeUtc)) {
    return { ok: false, reason: "Invalid working hours for that day." };
  }

  const needed = totalDurationMinutes + bufferMinutes;

  const { data: busyRows, error: busyErr } = await admin
    .from("appointments")
    .select("start_time, end_time")
    .eq("salon_id", salonId)
    .in("status", ["pending", "confirmed"])
    .gte("start_time", dayStartUtc.toISOString())
    .lt("start_time", dayEndExclusiveUtc.toISOString());

  if (busyErr) {
    console.error("[slots] appointments", busyErr.message);
    return { ok: false, reason: "Could not load schedule. Try again." };
  }

  const busy = (busyRows ?? []).map((r) => ({
    start: new Date(r.start_time),
    end: new Date(r.end_time),
  }));

  function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && bStart < aEnd;
  }

  const minStartSameDay = addMinutesUtc(now, SAME_DAY_MIN_LEAD_HOURS * 60);
  const slots: { index: number; startUtc: Date; label: string }[] = [];
  let t = openUtc;
  let idx = 0;

  for (;;) {
    const slotEnd = addMinutesUtc(t, needed);
    if (slotEnd.getTime() > closeUtc.getTime()) {
      break;
    }

    if (isSameDay(toZonedTime(t, SALON_TIMEZONE), toZonedTime(now, SALON_TIMEZONE))) {
      if (t.getTime() < minStartSameDay.getTime()) {
        t = addMinutesUtc(t, 5);
        continue;
      }
    }

    let hit = false;
    for (const b of busy) {
      if (overlaps(t, slotEnd, b.start, b.end)) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      idx += 1;
      slots.push({
        index: idx,
        startUtc: t,
        label: formatSlotLabel(t),
      });
    }
    t = addMinutesUtc(t, 5);
  }

  if (slots.length === 0) {
    return { ok: false, reason: "No open slots on that day. Try another date." };
  }

  return { ok: true, slots };
}
