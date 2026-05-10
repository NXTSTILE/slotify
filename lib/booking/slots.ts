import { addMinutes, format, isBefore, parseISO, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  APPOINTMENT_BUFFER_MINUTES,
  MAX_BOOKING_DAYS_AHEAD,
  SALON_TIMEZONE,
  SAME_DAY_MIN_LEAD_HOURS,
} from "@/lib/constants";

export type WindowStatus = {
  name: string;
  label: string;
  status: "AVAILABLE" | "FULLY_BOOKED";
  range: string;
  startUtc: Date;
  endUtc: Date;
};

export type WindowResult = 
  | { ok: true; windows: WindowStatus[] }
  | { ok: false; reason: string };

/** 
 * NEW LOGIC: Calculates availability for Morning and Evening sessions.
 */
export async function getAvailableWindows(
  admin: SupabaseClient<Database>,
  salonId: string,
  selectedDayUtc: Date,
  totalDurationMinutes: number,
  isManager: boolean = false // Managers bypass the 24h rule
): Promise<WindowResult> {
  const now = new Date();
  const zonedDay = toZonedTime(selectedDayUtc, SALON_TIMEZONE);
  const dayStartLocal = startOfDay(zonedDay);
  const dayStartUtc = parseISO(`${format(dayStartLocal, "yyyy-MM-dd")}T00:00:00+05:30`);
  const dayEndUtc = addMinutes(dayStartUtc, 24 * 60);

  // 1. Lead Time Validation (Bypassed if Manager)
  const minStartAllowed = isManager ? now : addMinutes(now, SAME_DAY_MIN_LEAD_HOURS * 60);
  if (isBefore(dayEndUtc, minStartAllowed)) {
    return { ok: false, reason: `Bookings must be made at least ${SAME_DAY_MIN_LEAD_HOURS} hours in advance.` };
  }

  // 2. Load Salon Working Hours & Holidays
  const dayOfWeek = zonedDay.getDay();
  const { data: wh } = await admin
    .from("working_hours")
    .select("open_time, close_time, is_closed")
    .eq("salon_id", salonId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  if (!wh || wh.is_closed) return { ok: false, reason: "The salon is closed on this day." };

  const openUtc = combineKolkataDateAndTime(dayStartUtc, wh.open_time!);
  const closeUtc = combineKolkataDateAndTime(dayStartUtc, wh.close_time!);

  // 3. Define Windows (Morning vs Evening)
  // Split point is 1:00 PM (13:00)
  const splitTimeUtc = combineKolkataDateAndTime(dayStartUtc, "13:00:00");
  
  const sessions = [
    { name: "Morning", start: openUtc, end: splitTimeUtc },
    { name: "Evening", start: splitTimeUtc, end: closeUtc }
  ];

  // 4. Fetch Busy Times (Appointments)
  const { data: busyRows } = await admin
    .from("appointments")
    .select("start_time, end_time")
    .eq("salon_id", salonId)
    .in("status", ["pending", "confirmed"])
    .gte("start_time", dayStartUtc.toISOString())
    .lt("start_time", dayEndUtc.toISOString());

  const busy = (busyRows ?? []).map(r => ({
    start: new Date(r.start_time),
    end: new Date(r.end_time)
  }));

  // 5. Calculate availability for each session
  const windowResults: WindowStatus[] = sessions.map(session => {
    // Total minutes in this window
    const totalWindowMinutes = (session.end.getTime() - session.start.getTime()) / 60000;
    
    // Minutes already booked in this window
    const bookedMinutes = busy.reduce((acc, b) => {
      const overlapStart = Math.max(session.start.getTime(), b.start.getTime());
      const overlapEnd = Math.min(session.end.getTime(), b.end.getTime());
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      return acc + (overlapMs / 60000);
    }, 0);

    const freeMinutes = totalWindowMinutes - bookedMinutes;
    const isAvailable = freeMinutes >= (totalDurationMinutes + APPOINTMENT_BUFFER_MINUTES);

    return {
      name: session.name,
      label: `${session.name} Session`,
      status: isAvailable ? "AVAILABLE" : "FULLY_BOOKED",
      range: `${format(toZonedTime(session.start, SALON_TIMEZONE), "hh:mm a")} - ${format(toZonedTime(session.end, SALON_TIMEZONE), "hh:mm a")}`,
      startUtc: session.start,
      endUtc: session.end
    };
  });

  return { ok: true, windows: windowResults };
}

/** Utility to merge a Date and a HH:mm:ss string into a Kolkata-zoned Date */
function combineKolkataDateAndTime(dayUtc: Date, timeStr: string): Date {
  const [h, m, s] = timeStr.split(":").map(Number);
  const local = toZonedTime(dayUtc, SALON_TIMEZONE);
  const iso = `${format(local, "yyyy-MM-dd")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s ?? 0).padStart(2, "0")}+05:30`;
  return parseISO(iso);
}

// Keep existing DD/MM/YYYY parser
export function parseDdMmYyyyKolkata(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
  return parseISO(`${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}T00:00:00+05:30`);
}
