/** Salon operations timezone (India) — DB stores UTC; slots/display use this zone */
export const SALON_TIMEZONE = "Asia/Kolkata";

/** Buffer minutes added after services for appointment end_time and overlap checks */
export const APPOINTMENT_BUFFER_MINUTES = 2;

/** Booking allowed within this many days from today */
export const MAX_BOOKING_DAYS_AHEAD = 14;

/** Same-day bookings must be at least this many hours from now */
export const SAME_DAY_MIN_LEAD_HOURS = 24;
