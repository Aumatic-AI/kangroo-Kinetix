import React from "react";
import { Users2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList, Tooltip } from "recharts";
import { ACCENT, CHART_SERIES, CHART_TOOLTIP_STYLE, SectionTitle, Card, EmptyState } from "@/components/global/DashboardKit";
import { OutreachDashboardData } from "../../hooks/useDashboard";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  not_interested: "Not Interested",
  bounced: "Bounced",
  do_not_contact: "Do Not Contact",
};

export function LeadStatusBreakdown({ breakdown }: { breakdown: OutreachDashboardData["leadStatusBreakdown"] }) {
  const data = breakdown.filter((b) => b.count > 0).map((b) => ({ ...b, label: STATUS_LABEL[b.status] || b.status }));

  return (
    <Card>
      <SectionTitle icon={Users2} accent={ACCENT.blue} title="Leads by Status" />
      {!data.length ? (
        <EmptyState message="No leads yet." />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 28, top: 0, bottom: 0 }} barCategoryGap="22%">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 12, fill: "var(--color-text)", fontWeight: 500 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "var(--color-surface)" }} formatter={(value: any) => [`${value} leads`, "Count"]} />
              <Bar dataKey="count" radius={[0, 8, 8, 0]} maxBarSize={16}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                ))}
                <LabelList dataKey="count" position="right" style={{ fill: "var(--color-text-muted)", fontSize: 12, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
