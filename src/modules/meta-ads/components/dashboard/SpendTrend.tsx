import React from "react";
import { TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ACCENT, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState, chartTickInterval } from "./shared";

interface SpendTrendProps {
  data: { date: string; spendCents: number }[];
  rangeDays: number;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SpendTrend({ data, rangeDays }: SpendTrendProps) {
  const hasSpend = data.some((d) => d.spendCents > 0);
  // Fewer ticks for longer windows so labels never collide, scaled to any
  // range length (rangeDays can be up to the "all time" cap).
  const tickInterval = chartTickInterval(rangeDays);

  return (
    <Card>
      <SectionTitle icon={TrendingUp} accent={ACCENT.purple} title="Ad Spend" />
      {!hasSpend ? (
        <EmptyState message="No spend synced yet — the nightly performance sync will populate this." />
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT.purple.solid} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ACCENT.purple.solid} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.15) || 10]} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
                labelFormatter={(v) => formatShortDate(v as string)}
                formatter={(value: any) => [`$${(value / 100).toFixed(2)}`, "Spend"]}
              />
              <Area
                type="monotone"
                dataKey="spendCents"
                stroke={ACCENT.purple.solid}
                strokeWidth={2}
                fill="url(#spendFill)"
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
