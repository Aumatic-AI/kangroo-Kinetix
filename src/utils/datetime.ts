import { format } from "date-fns";

const DATE_TIME_FORMAT = "d MMMM yyyy h:mm a";
const DATE_FORMAT = "d MMMM yyyy";

function toDate(input: string | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

/** App-wide date+time display, e.g. "4 June 2026 12:30 PM" — no seconds,
 * 12-hour clock. Use this instead of toLocaleString()/toLocaleDateString()
 * anywhere a timestamp is shown to the user. */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, DATE_TIME_FORMAT);
}

/** Date-only variant of the same format, e.g. "4 June 2026". */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, DATE_FORMAT);
}
