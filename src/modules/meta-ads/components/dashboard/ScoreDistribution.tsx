import { useState } from "react";
import { Gauge } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList, Tooltip } from "recharts";
import { ACCENT, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState } from "./shared";
import { MetaAdsDashboardData } from "../../hooks/useDashboard";
import { ScoreBucketDrawer } from "./ScoreBucketDrawer";

// A quality scale, not a plain categorical set — colored as a diverging
// good→bad ramp (green/blue cool "good" side, gray neutral midpoint,
// amber/red warm "bad" side) rather than the fixed categorical order, per
// the dataviz skill's status-color rule.
const BUCKET_COLOR: Record<string, string> = {
  Excellent: ACCENT.green.solid,
  Good: ACCENT.blue.solid,
  Average: "var(--color-text-secondary)",
  "Needs Work": ACCENT.amber.solid,
  Critical: ACCENT.red.solid,
};

export function ScoreDistribution({ buckets }: { buckets: MetaAdsDashboardData["scoreBuckets"] }) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const selectedBucket = buckets.find((b) => b.label === selectedLabel) || null;

  return (
    <Card>
      <SectionTitle icon={Gauge} accent={ACCENT.green} title="Self-Ad Performance" trailing={<span className="text-xs text-muted">{total} ad{total === 1 ? "" : "s"} scored</span>} />
      {total === 0 ? (
        <EmptyState message="No ads have run 7+ days yet — scores need at least a week of delivery data." />
      ) : (
        <div style={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} layout="vertical" margin={{ left: 4, right: 28, top: 0, bottom: 0 }} barCategoryGap="26%">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={78} tick={{ fontSize: 12, fill: "var(--color-text)", fontWeight: 500 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "var(--color-surface)" }} formatter={(value: any) => [`${value} ads — click bar for details`, "Count"]} />
              <Bar
                dataKey="count"
                radius={[0, 8, 8, 0]}
                maxBarSize={18}
                style={{ cursor: "pointer" }}
                onClick={(data: any) => {
                  if (data?.count > 0) setSelectedLabel(data.label);
                }}
              >
                {buckets.map((b) => (
                  <Cell key={b.label} fill={BUCKET_COLOR[b.label]} fillOpacity={b.count > 0 ? 1 : 0.35} />
                ))}
                <LabelList dataKey="count" position="right" style={{ fill: "var(--color-text-muted)", fontSize: 12, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <ScoreBucketDrawer open={!!selectedBucket} onClose={() => setSelectedLabel(null)} label={selectedBucket?.label ?? null} ads={selectedBucket?.ads ?? []} />
    </Card>
  );
}
