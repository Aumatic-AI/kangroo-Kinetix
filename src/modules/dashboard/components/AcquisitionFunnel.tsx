import { TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell, LabelList, ResponsiveContainer, Tooltip } from "recharts";
import { ACCENT, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState } from "@/components/global/DashboardKit";
import { RootDashboardData } from "../hooks/useDashboard";

const STAGE_COLOR = [ACCENT.blue.solid, ACCENT.purple.solid, ACCENT.green.solid];

/** The whole business's top-of-funnel, in one glance: how many people saw
 * something (Meta + Social impressions), how many acted on an ad (Meta
 * clicks), how many became a lead (Meta inbound + Outreach added) — a plain
 * bar chart, not a funnel shape, since the stages here are what actually
 * matters, not the drop-off geometry. */
export function AcquisitionFunnel({ stages }: { stages: RootDashboardData["funnel"] }) {
  const total = stages[0]?.value || 0;

  return (
    <Card>
      <SectionTitle icon={TrendingDown} accent={ACCENT.purple} title="Acquisition Overview" trailing={<span className="text-xs text-muted">reach → clicks → leads</span>} />
      {!total ? (
        <EmptyState message="No reach in the selected range yet." />
      ) : (
        <div style={{ height: 170 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stages} layout="vertical" margin={{ left: 4, right: 60, top: 0, bottom: 0 }} barCategoryGap="32%">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="stage" width={64} tick={{ fontSize: 12, fill: "var(--color-text)", fontWeight: 500 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "var(--color-surface)" }} formatter={(value: any) => [value.toLocaleString(), ""]} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={28}>
                {stages.map((s, i) => (
                  <Cell key={s.stage} fill={STAGE_COLOR[i % STAGE_COLOR.length]} />
                ))}
                <LabelList dataKey="value" position="right" formatter={(v: any) => v.toLocaleString()} style={{ fill: "var(--color-text-muted)", fontSize: 13, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
