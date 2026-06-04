import { addMinutes } from "date-fns";
import { db } from "@/lib/db";
import { APPOINTMENT_BUFFER_MINUTES } from "@/lib/constants";

export type StaffAssignmentResult = {
  staffId: string;
  staffName: string;
  assignedStartUtc: Date;
};

/**
 * Assigns the best available staff member for a booking.
 *
 * For each selected service (in order), finds the staff who:
 *   1. Can perform that specific service (linked via staff_services)
 *   2. Has the earliest available slot (their own latest appointment end + buffer,
 *      OR the session window start — whichever is later)
 *   3. Services are chained: the next service starts after the previous one finishes
 *      from the customer's perspective.
 *
 * The PRIMARY staff (assigned to the appointment row) is whoever handles the
 * first service.
 *
 * Falls back gracefully:
 *   - If a particular service has no linked staff → skip per-service assignment
 *     for that service and carry on (don't block the whole booking).
 *   - If NO services have any linked staff at all → return null (caller uses
 *     the salon-level queue instead).
 */
export async function assignStaff(
  salonId: string,
  serviceIds: string[],
  requestedStartUtc: Date,
  totalDurationMinutes: number
): Promise<StaffAssignmentResult | null> {
  if (!serviceIds.length) return null;

  // 1. Load all active staff and the services each can perform
  const staffRes = await db.query<{
    id: string;
    name: string;
    service_ids: string[] | null;
  }>(
    `SELECT s.id, s.name,
            ARRAY_AGG(ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL) AS service_ids
     FROM public.staff s
     LEFT JOIN public.staff_services ss ON ss.staff_id = s.id
     WHERE s.salon_id = $1 AND s.is_active = true
     GROUP BY s.id, s.name
     ORDER BY s.name ASC`,
    [salonId]
  );

  if (!staffRes.rows.length) return null;

  // 2. Load individual service durations (for chaining)
  const svcRes = await db.query<{ id: string; duration_minutes: number }>(
    `SELECT id, duration_minutes FROM public.services WHERE id = ANY($1::uuid[])`,
    [serviceIds]
  );
  const durationOf = new Map(svcRes.rows.map((r) => [r.id, r.duration_minutes]));

  // 3. Process each service in order — find earliest available staff for each
  let chainEnd: Date = requestedStartUtc; // when the "customer's chair" becomes free
  let primaryStaffId: string | null = null;
  let primaryStaffName = "";
  let overallStart: Date = requestedStartUtc;
  let anyServiceAssigned = false;

  for (const serviceId of serviceIds) {
    // Staff who can perform this specific service
    const qualifying = staffRes.rows.filter((row) =>
      (row.service_ids ?? []).includes(serviceId)
    );

    if (!qualifying.length) {
      // No staff configured for this service — advance chainEnd by the service
      // duration and continue (don't block the whole booking)
      const dur = durationOf.get(serviceId) ?? 0;
      chainEnd = addMinutes(chainEnd, dur + APPOINTMENT_BUFFER_MINUTES);
      continue;
    }

    // For each qualifying staff, compute earliest they can start (>= chainEnd)
    let bestStaffId: string | null = null;
    let bestStaffName = "";
    let bestStart: Date = new Date(8640000000000000); // sentinel: very far future

    for (const staff of qualifying) {
      // Fetch all appointments for this staff within the next 24 hours
      const busyRes = await db.query<{ start_time: string; end_time: string }>(
        `SELECT start_time, end_time
         FROM public.appointments
         WHERE salon_id = $1
           AND staff_id = $2
           AND status IN ('pending', 'confirmed')
           AND end_time > $3
           AND start_time < $4
         ORDER BY start_time ASC`,
        [
          salonId,
          staff.id,
          chainEnd.toISOString(),
          addMinutes(chainEnd, 24 * 60).toISOString(),
        ]
      );

      let availableAt = new Date(chainEnd);
      const requiredDurMinutes = (durationOf.get(serviceId) ?? 0) + APPOINTMENT_BUFFER_MINUTES;
      const requiredDurMs = requiredDurMinutes * 60000;

      for (const row of busyRes.rows) {
        const aptStart = new Date(row.start_time);
        const aptEnd = new Date(row.end_time);

        // Does the gap between availableAt and this appointment's start fit our service?
        if (aptStart.getTime() - availableAt.getTime() >= requiredDurMs) {
          break; // We found a gap big enough before this appointment!
        }

        // Cannot fit before this appointment, so our earliest possible start is after it
        const possibleNextStart = addMinutes(aptEnd, APPOINTMENT_BUFFER_MINUTES);
        if (possibleNextStart > availableAt) {
          availableAt = possibleNextStart;
        }
      }

      // Pick the staff with the EARLIEST available slot
      if (availableAt < bestStart) {
        bestStart = availableAt;
        bestStaffId = staff.id;
        bestStaffName = staff.name;
      }
    }

    if (!bestStaffId) continue; // safety — shouldn't happen

    // Record primary (first) staff
    if (!anyServiceAssigned) {
      primaryStaffId = bestStaffId;
      primaryStaffName = bestStaffName;
      overallStart = bestStart;
      anyServiceAssigned = true;
    }

    // Advance chain for the next service
    const dur = durationOf.get(serviceId) ?? 0;
    chainEnd = addMinutes(bestStart, dur + APPOINTMENT_BUFFER_MINUTES);
  }

  if (!primaryStaffId) return null; // no services had any qualified staff

  return {
    staffId: primaryStaffId,
    staffName: primaryStaffName,
    assignedStartUtc: overallStart,
  };
}
