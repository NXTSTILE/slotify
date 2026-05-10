/** Normalize WhatsApp `from` to E.164 (digits, optional leading +). */
export function normalizeCustomerPhone(waFrom: string): string {
  const digits = waFrom.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return waFrom.startsWith("+") ? waFrom : `+${waFrom}`;
}
