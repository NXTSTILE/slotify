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
 *  - the requested start time (session window start)
 *  - the total appointment duration
 *
 * Priority rules:
 *   Rule 1 — Closest next-available slot (smallest wait time) wins.
 *   Rule 2 — Among ties, specialists (fewer total services) are preferred
 *             over generalists (staff who can do every salon service).
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
  //    = max(requestedStartUtc, their latest booked end_time + BUFFER)
  const candidates: {
    staffId: string;
    staffName: string;
    assignedStart: Date;
    serviceCount: number;
  }[] = [];

  for (const staff of qualifying) {
    // Find their latest appointment that ends after the requested start
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
    // A "generalist" is someone who can perform EVERY service in the salon.
    const aIsGeneralist = a.serviceCount >= totalSalonServices;
    const bIsGeneralist = b.serviceCount >= totalSalonServices;
    if (aIsGeneralist !== bIsGeneralist) {
      return aIsGeneralist ? 1 : -1; // generalists go last
    }

    // Within same tier: fewer services = more specialist = preferred
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
