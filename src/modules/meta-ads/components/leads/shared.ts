export const LOCALES = [
  { value: "EN_US", label: "English (US)" },
  { value: "EN_GB", label: "English (UK)" },
  { value: "ES_LA", label: "Spanish" },
  { value: "FR_FR", label: "French" },
  { value: "DE_DE", label: "German" },
  { value: "TR_TR", label: "Turkish" },
  { value: "AR_AR", label: "Arabic" },
];

/** Meta's raw locale code (e.g. "EN_US") isn't something anyone should have
 * to read directly — shown as a friendly label everywhere a form's
 * language appears (the forms table, the details modal). Falls back to the
 * raw code only if it's somehow outside our known list. */
export function localeLabel(code?: string | null): string {
  if (!code) return "—";
  return LOCALES.find((l) => l.value === code)?.label || code;
}
