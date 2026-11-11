import { TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ACCENT, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState, chartTickInterval } from "@/components/global/DashboardKit";
import { RootDashboardData } from "../hooks/useDashboard";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Social impressions per day for the selected range. */
export function ReachTrend({ data }: { data: RootDashboardData["reachTrend"] }) {
  const total = data.reduce((s, d) => s + d.social, 0);
  const tickInterval = chartTickInterval(data.length);

  return (
    <Card>
      <SectionTitle icon={TrendingUp} accent={ACCENT.blue} title="Total Reach" trailing={<span className="text-xs text-muted">Social</span>} />
      {!total ? (
        <EmptyState message="No reach in the selected range yet." />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis hide />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }} labelFormatter={(v) => formatShortDate(v as string)} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="social" name="Social" stroke={ACCENT.green.solid} fill={ACCENT.green.solid} fillOpacity={0.5} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
