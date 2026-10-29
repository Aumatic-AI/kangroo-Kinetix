import React from "react";
import { TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ACCENT, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState, chartTickInterval } from "@/components/global/DashboardKit";
import { OutreachDashboardData } from "../../hooks/useDashboard";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SendsTrend({ data }: { data: OutreachDashboardData["sendsTrend"] }) {
  const hasSends = data.some((d) => d.count > 0);
  // Scales to any length — there's no fixed window here, sends history can
  // be arbitrarily long, so a fixed set of thresholds would eventually run out.
  const tickInterval = chartTickInterval(data.length);

  return (
    <Card>
      <SectionTitle icon={TrendingUp} accent={ACCENT.green} title="Emails Sent" />
      {!hasSends ? (
        <EmptyState message="No emails sent yet." />
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="sendsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT.green.solid} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ACCENT.green.solid} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.15) || 5]} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
                labelFormatter={(v) => formatShortDate(v as string)}
                formatter={(value: any) => [value, "Sent"]}
              />
              <Area type="monotone" dataKey="count" stroke={ACCENT.green.solid} strokeWidth={2} fill="url(#sendsFill)" activeDot={{ r: 4, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
