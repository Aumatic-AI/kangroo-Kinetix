import { Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ACCENT, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState, chartTickInterval } from "@/components/global/DashboardKit";
import { RootDashboardData } from "../hooks/useDashboard";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The one genuinely cross-module chart on this page — both series are the
 * same kind of thing (a new lead record entering the system), just from
 * different sources, so a grouped bar is honest about the comparison
 * instead of quietly summing two different concepts into one number. */
export function LeadsBySource({ data }: { data: RootDashboardData["leadsBySource"] }) {
  const total = data.reduce((s, d) => s + d.meta + d.outreach, 0);
  const tickInterval = chartTickInterval(data.length);

  return (
    <Card>
      <SectionTitle icon={Users} accent={ACCENT.purple} title="New Leads by Source" />
      {!total ? (
        <EmptyState message="No new leads in the selected range." />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="24%">
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis hide />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "var(--color-surface)" }} labelFormatter={(v) => formatShortDate(v as string)} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="meta" name="Meta Ads" stackId="leads" fill={ACCENT.purple.solid} radius={[0, 0, 0, 0]} maxBarSize={28} />
              <Bar dataKey="outreach" name="Outreach" stackId="leads" fill={ACCENT.blue.solid} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
