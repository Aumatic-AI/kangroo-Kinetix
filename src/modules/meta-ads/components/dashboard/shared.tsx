export { ACCENT, CHART_SERIES, CHART_TOOLTIP_STYLE, Card, SectionTitle, EmptyState, chartTickInterval } from "@/components/global/DashboardKit";

export function scoreColor(score: string) {
  const s = (score || "").toLowerCase();
  if (s === "strong") return "text-success bg-success-bg";
  if (s === "moderate") return "text-primary bg-primary-subtle";
  return "text-muted bg-surface";
}
