import { Heart } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ACCENT, CHART_SERIES, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState } from "@/components/global/DashboardKit";
import { SocialDashboardData } from "../../hooks/useDashboard";

const TYPE_LABEL: Record<string, string> = { likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves" };

/** What kind of engagement you're actually getting — same real numbers
 * already summed into the Engagement KPI, broken back into their parts. */
export function EngagementBreakdown({ data }: { data: SocialDashboardData["engagementBreakdown"] | undefined }) {
  const entries = (data || []).map((d) => ({ name: TYPE_LABEL[d.type] || d.type, value: d.value }));
  const total = entries.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <SectionTitle icon={Heart} accent={ACCENT.red} title="Engagement Breakdown" />
      {!total ? (
        <EmptyState message="No engagement yet." />
      ) : (
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={entries} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={3} strokeWidth={0}>
                  {entries.map((_, i) => (
                    <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: any, name: any) => [`${value.toLocaleString()} (${Math.round((value / total) * 100)}%)`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5 flex-1 min-w-0">
            {entries.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_SERIES[i % CHART_SERIES.length] }} />
                  <span className="text-sm text-text truncate">{d.name}</span>
                </span>
                <span className="text-sm font-bold text-text tabular-nums shrink-0">{d.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
