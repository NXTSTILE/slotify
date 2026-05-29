import { addMinutes, format, isBefore, parseISO, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";
import {
  APPOINTMENT_BUFFER_MINUTES,
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
 * Queries DigitalOcean PostgreSQL directly.
 */
export async function getAvailableWindows(
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

  // 2. Load Salon Working Hours
  const dayOfWeek = zonedDay.getDay();
  
  const whRes = await db.query(
    "SELECT open_time, close_time, is_closed FROM public.working_hours WHERE salon_id = $1 AND day_of_week = $2 LIMIT 1",
    [salonId, dayOfWeek]
  );
  const wh = whRes.rows[0];

  if (!wh || wh.is_closed) return { ok: false, reason: "The salon is closed on this day." };

  const openUtc = combineKolkataDateAndTime(dayStartUtc, wh.open_time);
  const closeUtc = combineKolkataDateAndTime(dayStartUtc, wh.close_time);

  // 3. Define Windows (Morning vs Evening)
  // Split point is 1:00 PM (13:00)
  const splitTimeUtc = combineKolkataDateAndTime(dayStartUtc, "13:00:00");
  
  const sessions = [
    { name: "Morning", start: openUtc, end: splitTimeUtc },
    { name: "Evening", start: splitTimeUtc, end: closeUtc }
  ];

  // 4. Fetch Busy Times (Appointments) from PostgreSQL
  const busyRes = await db.query(
    `SELECT start_time, end_time FROM public.appointments 
     WHERE salon_id = $1 AND status IN ('pending', 'confirmed') 
     AND start_time >= $2 AND start_time < $3`,
    [salonId, dayStartUtc.toISOString(), dayEndUtc.toISOString()]
  );
  const busyRows = busyRes.rows;

  const busy = busyRows.map(r => ({
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
