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
 * Checks if a specific queue (or the salon overall) has a contiguous time slot of length
 * totalDurationMinutes + buffer within a session window.
 */
async function hasAvailableSlot(
  salonId: string,
  queueId: string | null,
  sessionStart: Date,
  sessionEnd: Date,
  totalDurationMinutes: number
): Promise<boolean> {
  const requiredDurMs = (totalDurationMinutes + APPOINTMENT_BUFFER_MINUTES) * 60000;

  let queryText = `
    SELECT start_time, end_time FROM public.appointments 
    WHERE salon_id = $1 AND is_deleted = false AND status IN ('pending', 'confirmed')
      AND end_time > $2 AND start_time < $3
  `;
  const params: any[] = [salonId, sessionStart.toISOString(), sessionEnd.toISOString()];

  if (queueId) {
    queryText += ` AND queue_id = $4`;
    params.push(queueId);
  }

  queryText += ` ORDER BY start_time ASC`;

  const res = await db.query<{ start_time: string; end_time: string }>(queryText, params);

  let availableAt = new Date(sessionStart);

  for (const row of res.rows) {
    const aptStart = new Date(row.start_time);
    const aptEnd = new Date(row.end_time);

    // Does the gap between availableAt and this appointment's start fit our booking?
    if (aptStart.getTime() - availableAt.getTime() >= requiredDurMs) {
      return true; // Found a slot!
    }

    // Update availableAt to be after this appointment
    const possibleNextStart = addMinutes(aptEnd, APPOINTMENT_BUFFER_MINUTES);
    if (possibleNextStart > availableAt) {
      availableAt = possibleNextStart;
    }
  }

  // Check after the last appointment
  return (availableAt.getTime() + requiredDurMs) <= sessionEnd.getTime();
}

/** 
 * Calculates availability for Morning and Evening sessions.
 *
 * @param bypassLeadTime - When true, disables the SAME_DAY_MIN_LEAD_HOURS restriction.
 *   Use for bot bookings (customers book at current time) and manager/walk-in bookings.
 */
export async function getAvailableWindows(
  salonId: string,
  selectedDayUtc: Date,
  totalDurationMinutes: number,
  bypassLeadTime: boolean = false
): Promise<WindowResult> {
  const now = new Date();
  const zonedDay = toZonedTime(selectedDayUtc, SALON_TIMEZONE);
  const dayStartLocal = startOfDay(zonedDay);
  const dayStartUtc = parseISO(`${format(dayStartLocal, "yyyy-MM-dd")}T00:00:00+05:30`);
  const dayEndUtc = addMinutes(dayStartUtc, 24 * 60);

  // 1. Lead Time Validation (Bypassed for same-day bot bookings and managers)
  if (!bypassLeadTime) {
    const minStartAllowed = addMinutes(now, SAME_DAY_MIN_LEAD_HOURS * 60);
    if (isBefore(dayEndUtc, minStartAllowed)) {
      return { ok: false, reason: `Bookings must be made at least ${SAME_DAY_MIN_LEAD_HOURS} hours in advance.` };
    }
  }

  // For same-day: ensure the day hasn't entirely passed
  if (isBefore(dayEndUtc, now)) {
    return { ok: false, reason: "This date has already passed. Please choose today or tomorrow." };
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
  // Split point is 1:00 PM (13:00) Kolkata time
  const splitTimeUtc = combineKolkataDateAndTime(dayStartUtc, "13:00:00");
  
  // For same-day bookings, constrain session start to current time
  const effectiveNow = bypassLeadTime ? now : now;

  const sessions = [
    { 
      name: "Morning", 
      start: maxDate(openUtc, effectiveNow),
      rawStart: openUtc,
      end: splitTimeUtc 
    },
    { 
      name: "Evening", 
      start: maxDate(splitTimeUtc, effectiveNow),
      rawStart: splitTimeUtc,
      end: closeUtc 
    }
  ];

  // 4. Load Active Queues
  const queueRes = await db.query<{ id: string }>(
    "SELECT id FROM public.queues WHERE salon_id = $1 AND is_active = true",
    [salonId]
  );
  const activeQueues = queueRes.rows;

  // 5. Calculate availability for each session using precise gap check
  const validSessions = sessions.filter(session => isBefore(session.start, session.end));

  const windowResults = await Promise.all(
    validSessions.map(async (session) => {
      let isAvailable = false;

      if (activeQueues.length > 0) {
        // Check if ANY active queue has an available slot
        for (const queue of activeQueues) {
          if (await hasAvailableSlot(salonId, queue.id, session.start, session.end, totalDurationMinutes)) {
            isAvailable = true;
            break;
          }
        }
      } else {
        // No queues configured — check salon-wide single timeline
        isAvailable = await hasAvailableSlot(salonId, null, session.start, session.end, totalDurationMinutes);
      }

      return {
        name: session.name,
        label: `${session.name} Session`,
        status: isAvailable ? ("AVAILABLE" as const) : ("FULLY_BOOKED" as const),
        range: `${format(toZonedTime(session.rawStart, SALON_TIMEZONE), "hh:mm a")} - ${format(toZonedTime(session.end, SALON_TIMEZONE), "hh:mm a")}`,
        startUtc: session.start,
        endUtc: session.end
      };
    })
  );

  return { ok: true, windows: windowResults };
}

/** Returns the later of two dates */
function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
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
