import { addMinutes, parseISO } from "date-fns";
import { db } from "@/lib/db";
import { APPOINTMENT_BUFFER_MINUTES } from "@/lib/constants";

export type StaffAssignmentResult = {
  staffId: string;
  staffName: string;
  assignedStartUtc: Date;
};

/**
 * Finds the best staff member to assign for a booking given:
 *  - the list of service IDs the customer wants
 *  - the requested start time (session window start — the earliest we can begin)
 *  - the total appointment duration
 *
 * IMPORTANT — Each staff member has an INDEPENDENT schedule.
 * Their earliest available start is:
 *   max(requestedStartUtc, their_own_latest_end_time + BUFFER)
 *
 * This means Staff B is never forced to wait for Staff A's appointments to finish.
 *
 * Priority rules:
 *   Rule 1 — Closest next-available slot (smallest wait time) wins.
 *   Rule 2 — Among ties, specialists (fewer total services) are preferred
 *             over generalists (staff who can do every salon service).
 *   Rule 3 — Alphabetical name as stable tiebreaker.
 *
 * Returns null if no active staff can handle all the requested services.
 */
export async function assignStaff(
  salonId: string,
  serviceIds: string[],
  requestedStartUtc: Date,
  totalDurationMinutes: number
): Promise<StaffAssignmentResult | null> {
  if (!serviceIds.length) return null;

  // 1. Load all active staff for this salon along with their service IDs
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

  // 2. Count total active services in the salon (to identify generalists)
  const totalSvcRes = await db.query(
    "SELECT COUNT(*)::int AS cnt FROM public.services WHERE salon_id = $1 AND is_active = true",
    [salonId]
  );
  const totalSalonServices: number = totalSvcRes.rows[0]?.cnt ?? 0;

  // 3. Filter: keep only staff who can perform ALL of the requested services
  const qualifying = staffRes.rows.filter((row) => {
    const staffServiceIds: string[] = row.service_ids ?? [];
    return serviceIds.every((sid) => staffServiceIds.includes(sid));
  });

  if (!qualifying.length) return null;

  // 4. For each qualifying staff, compute their earliest available start time
  //    INDEPENDENTLY — only look at THEIR OWN appointments, not the salon's overall queue.
  //
  //    Formula:
  //      latestOwnEnd = latest end_time of appointments assigned to THIS staff member
  //                     (pending or confirmed, any time — not restricted to after requestedStart)
  //      assignedStart = max(requestedStartUtc, latestOwnEnd + BUFFER)
  //
  //    This ensures Staff B can start at the session window start even if Staff A is busy until 10:00.
  const candidates: {
    staffId: string;
    staffName: string;
    assignedStart: Date;
    serviceCount: number;
  }[] = [];

  for (const staff of qualifying) {
    // Find this staff member's latest active appointment end time
    // We look at all future/ongoing appointments, not just those starting after requestedStartUtc,
    // so that back-to-back bookings on the same staff are properly chained.
    const busyRes = await db.query(
      `SELECT end_time
       FROM public.appointments
       WHERE salon_id = $1
         AND staff_id = $2
         AND status IN ('pending', 'confirmed')
         AND end_time > $3
       ORDER BY end_time DESC
       LIMIT 1`,
      [salonId, staff.id, requestedStartUtc.toISOString()]
    );

    let assignedStart: Date = requestedStartUtc;

    if (busyRes.rows.length > 0) {
      const lastEnd = new Date(busyRes.rows[0].end_time);
      const afterBuffer = addMinutes(lastEnd, APPOINTMENT_BUFFER_MINUTES);
      // Only push start forward if the staff's own busy time overlaps the requested slot
      if (afterBuffer > requestedStartUtc) {
        assignedStart = afterBuffer;
      }
    }

    candidates.push({
      staffId: staff.id,
      staffName: staff.name,
      assignedStart,
      serviceCount: (staff.service_ids ?? []).length,
    });
  }

  // 5. Sort candidates:
  //    Primary   — earliest assignedStart (minimise wait for the customer)
  //    Secondary — fewer services = specialist first (generalists last)
  //    Tertiary  — alphabetical name as stable tiebreaker
  candidates.sort((a, b) => {
    const timeDiff = a.assignedStart.getTime() - b.assignedStart.getTime();
    if (timeDiff !== 0) return timeDiff;

    // Among equal times: prefer specialists (lower serviceCount) over generalists
    const aIsGeneralist = a.serviceCount >= totalSalonServices;
    const bIsGeneralist = b.serviceCount >= totalSalonServices;
    if (aIsGeneralist !== bIsGeneralist) {
      return aIsGeneralist ? 1 : -1;
    }

    if (a.serviceCount !== b.serviceCount) return a.serviceCount - b.serviceCount;

    return a.staffName.localeCompare(b.staffName);
  });

  const best = candidates[0];
  if (!best) return null;

  return {
    staffId: best.staffId,
    staffName: best.staffName,
    assignedStartUtc: best.assignedStart,
  };
}
