import React from "react";
import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ACCENT, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState } from "@/components/global/DashboardKit";
import { OutreachDashboardData } from "../../hooks/useDashboard";

function truncate(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function CampaignBreakdown({ campaigns }: { campaigns: OutreachDashboardData["campaignBreakdown"] }) {
  if (!campaigns.length) {
    return (
      <Card>
        <SectionTitle icon={BarChart3} accent={ACCENT.purple} title="Campaign Performance" />
        <EmptyState message="No campaign has sent anything yet." />
      </Card>
    );
  }

  const data = campaigns.map((c) => ({ ...c, shortName: truncate(c.name) }));

  return (
    <Card>
      <SectionTitle icon={BarChart3} accent={ACCENT.purple} title="Campaign Performance" />
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barCategoryGap="24%">
            <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "var(--color-surface)" }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ""}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Bar dataKey="sent" name="Sent" fill={ACCENT.purple.solid} radius={[4, 4, 0, 0]} maxBarSize={20} />
            <Bar dataKey="opened" name="Opened" fill={ACCENT.blue.solid} radius={[4, 4, 0, 0]} maxBarSize={20} />
            <Bar dataKey="replied" name="Replied" fill={ACCENT.green.solid} radius={[4, 4, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
