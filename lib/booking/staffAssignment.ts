import { addMinutes, parseISO } from "date-fns";
import { db } from "@/lib/db";
import { APPOINTMENT_BUFFER_MINUTES } from "@/lib/constants";

export type StaffAssignmentResult = {
  staffId: string;
  staffName: string;
  assignedStartUtc: Date;
};

/**
 * Per-service staff assignment result.
 * Each service gets its own staff member (the earliest available for that service).
 */
export type PerServiceAssignment = {
  serviceId: string;
  staffId: string;
  staffName: string;
  startUtc: Date;
  endUtc: Date;
};

export type MultiStaffResult = {
  /** The staff assigned to the first service (stored on the appointment row) */
  primaryStaffId: string;
  primaryStaffName: string;
  /** Earliest start across all assignments (= start of the first service) */
  assignedStartUtc: Date;
  /** Per-service breakdown */
  assignments: PerServiceAssignment[];
};

/**
 * Assigns staff to a multi-service booking.
 *
 * Strategy (per-service, greedy earliest-first):
 *   For each service in order:
 *     1. Find all active staff who can perform this service.
 *     2. For each candidate, compute their earliest available start:
 *           max(previousServiceEnd, their own latest appointment end + BUFFER)
 *        (previousServiceEnd is the end of the last assigned service so far,
 *         ensuring services are chained back-to-back for the customer.)
 *     3. Pick the candidate with the smallest wait (earliest assignedStart).
 *     4. Advance the running "chain end" by this service duration + BUFFER.
 *
 * This means:
 *  - Different services CAN go to different staff members.
 *  - A staff member WILL be reused for back-to-back services if they are
 *    still the earliest available.
 *  - If no staff can handle a particular service, the whole assignment
 *    returns null (fall back to no-staff queue).
 *
 * Returns null if no active staff are configured or a service has no qualified staff.
 */
export async function assignStaff(
  salonId: string,
  serviceIds: string[],
  requestedStartUtc: Date,
  _totalDurationMinutes: number // kept for API compat, not used here
): Promise<StaffAssignmentResult | null> {
  if (!serviceIds.length) return null;

  // Load all active staff and their service capabilities
  const staffRes = await db.query(
    `SELECT s.id, s.name,
            ARRAY_AGG(ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL) AS service_ids
     FROM public.staff s
     LEFT JOIN public.staff_services ss ON ss.staff_id = s.id
     WHERE s.salon_id = $1 AND s.is_active = true
     GROUP BY s.id, s.name`,
    [salonId]
  );

  if (!staffRes.rows.length) return null;

  // Load service durations in the order of serviceIds
  const svcRes = await db.query(
    `SELECT id, duration_minutes FROM public.services WHERE id = ANY($1)`,
    [serviceIds]
  );
  const svcDurationMap = new Map<string, number>(
    svcRes.rows.map((r) => [r.id, r.duration_minutes])
  );

  // Build a lookup: staffId -> Set of service IDs they can do
  const staffCapability = new Map<string, Set<string>>();
  for (const row of staffRes.rows) {
    staffCapability.set(row.id, new Set<string>(row.service_ids ?? []));
  }

  // Per-service assignment loop
  const assignments: PerServiceAssignment[] = [];
  // chainEnd tracks when the "customer chair" is free — services must be sequential
  let chainEnd: Date = requestedStartUtc;

  for (const serviceId of serviceIds) {
    const duration = svcDurationMap.get(serviceId) ?? 0;

    // Find qualifying staff for this service
    const qualifying = staffRes.rows.filter((row) =>
      (staffCapability.get(row.id) ?? new Set()).has(serviceId)
    );

    if (!qualifying.length) {
      // No staff can perform this service — fall back to no-staff queue
      return null;
    }

    // For each qualifying staff, find their earliest available start
    // They can start at max(chainEnd, their own latest end + buffer)
    let bestStaffId: string | null = null;
    let bestStaffName = "";
    let bestStart: Date = new Date(8640000000000000); // max date sentinel

    for (const staff of qualifying) {
      // Find this staff member's latest appointment end time
      const busyRes = await db.query(
        `SELECT end_time
         FROM public.appointments
         WHERE salon_id = $1
           AND staff_id = $2
           AND status IN ('pending', 'confirmed')
           AND end_time > $3
         ORDER BY end_time DESC
         LIMIT 1`,
        [salonId, staff.id, chainEnd.toISOString()]
      );

      let staffAvailableAt: Date = chainEnd;

      if (busyRes.rows.length > 0) {
        const lastEnd = new Date(busyRes.rows[0].end_time);
        const afterBuffer = addMinutes(lastEnd, APPOINTMENT_BUFFER_MINUTES);
        if (afterBuffer > chainEnd) {
          staffAvailableAt = afterBuffer;
        }
      }

      if (staffAvailableAt < bestStart) {
        bestStart = staffAvailableAt;
        bestStaffId = staff.id;
        bestStaffName = staff.name;
      }
    }

    if (!bestStaffId) return null;

    const svcEnd = addMinutes(bestStart, duration + APPOINTMENT_BUFFER_MINUTES);

    assignments.push({
      serviceId,
      staffId: bestStaffId,
      staffName: bestStaffName,
      startUtc: bestStart,
      endUtc: svcEnd,
    });

    // Next service starts after this one ends (customer perspective)
    chainEnd = svcEnd;
  }

  if (!assignments.length) return null;

  const first = assignments[0];

  // Return in the shape expected by the caller (StaffAssignmentResult)
  // The overall appointment start = first service start
  return {
    staffId: first.staffId,
    staffName: first.staffName,
    assignedStartUtc: first.startUtc,
  };
}
