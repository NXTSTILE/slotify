import { addMinutes } from "date-fns";
import { db } from "@/lib/db";
import { APPOINTMENT_BUFFER_MINUTES } from "@/lib/constants";

export type QueueAssignmentResult = {
  queueId: string;
  queueName: string;
  assignedStartUtc: Date;
};

/**
 * Assigns the best available queue for a booking.
 *
 * For the total duration, finds the queue who:
 *   1. Has the earliest available slot (their own latest appointment end + buffer,
 *      OR the session window start — whichever is later)
 */
export async function assignQueue(
  salonId: string,
  requestedStartUtc: Date,
  totalDurationMinutes: number
): Promise<QueueAssignmentResult | null> {
  // 1. Load all active queues
  const queueRes = await db.query<{
    id: string;
    name: string;
  }>(
    `SELECT id, name
     FROM public.queues
     WHERE salon_id = $1 AND is_active = true
     ORDER BY name ASC`,
    [salonId]
  );

  const activeQueues = queueRes.rows;
  if (!activeQueues.length) return null;

  let bestQueueId: string | null = null;
  let bestQueueName = "";
  let bestStart: Date = new Date(8640000000000000); // sentinel: very far future

  const requiredDurMs = (totalDurationMinutes + APPOINTMENT_BUFFER_MINUTES) * 60000;

  for (const queue of activeQueues) {
    // Fetch all appointments for this queue within the next 24 hours
    const busyRes = await db.query<{ start_time: string; end_time: string }>(
      `SELECT start_time, end_time
       FROM public.appointments
       WHERE salon_id = $1
         AND queue_id = $2
         AND is_deleted = false
         AND status IN ('pending', 'confirmed')
         AND end_time > $3
         AND start_time < $4
       ORDER BY start_time ASC`,
      [
        salonId,
        queue.id,
        requestedStartUtc.toISOString(),
        addMinutes(requestedStartUtc, 24 * 60).toISOString(),
      ]
    );

    let availableAt = new Date(requestedStartUtc);

    for (const row of busyRes.rows) {
      const aptStart = new Date(row.start_time);
      const aptEnd = new Date(row.end_time);

      // Does the gap between availableAt and this appointment's start fit our booking?
      if (aptStart.getTime() - availableAt.getTime() >= requiredDurMs) {
        break; // We found a gap big enough before this appointment!
      }

      // Cannot fit before this appointment, so our earliest possible start is after it
      const possibleNextStart = addMinutes(aptEnd, APPOINTMENT_BUFFER_MINUTES);
      if (possibleNextStart > availableAt) {
        availableAt = possibleNextStart;
      }
    }

    // Pick the queue with the EARLIEST available slot
    if (availableAt < bestStart) {
      bestStart = availableAt;
      bestQueueId = queue.id;
      bestQueueName = queue.name;
    }
  }

  if (!bestQueueId) return null;

  return {
    queueId: bestQueueId,
    queueName: bestQueueName,
    assignedStartUtc: bestStart,
  };
}
