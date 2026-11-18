import { Users2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell, LabelList, ResponsiveContainer, Tooltip } from "recharts";
import { ACCENT, CHART_SERIES, CHART_TOOLTIP_STYLE, SectionTitle, Card } from "@/components/global/DashboardKit";

const GENDER_LABEL: Record<string, string> = { F: "Female", M: "Male", U: "Unspecified" };

function MiniBarChart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div>
      <p className="text-xs font-bold text-muted uppercase tracking-wide mb-3">{title}</p>
      <div style={{ height: Math.max(120, data.length * 34) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }} barCategoryGap="28%">
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={88} tick={{ fontSize: 12, fill: "var(--color-text)", fontWeight: 500 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "var(--color-surface)" }} formatter={(value: any) => [`${Math.round((value / total) * 100)}%`, ""]} />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={22}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
              ))}
              <LabelList dataKey="value" position="right" formatter={(v: any) => `${Math.round((v / total) * 100)}%`} style={{ fill: "var(--color-text-muted)", fontSize: 12, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function AudienceDemographics({ demographics }: { demographics: { age: Record<string, number>; gender: Record<string, number> } }) {
  const age = Object.entries(demographics.age)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
  const gender = Object.entries(demographics.gender)
    .sort(([, a], [, b]) => b - a)
    .map(([label, value]) => ({ label: GENDER_LABEL[label] || label, value }));

  return (
    <Card>
      <SectionTitle icon={Users2} accent={ACCENT.red} title="Audience" trailing={<span className="text-xs text-muted">Instagram only</span>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <MiniBarChart title="Age" data={age} />
        <MiniBarChart title="Gender" data={gender} />
      </div>
      <p className="text-[11px] text-muted/70 mt-4">Only Instagram provides audience demographics through our data source — Facebook, YouTube, TikTok, LinkedIn, and X don&apos;t expose this, so there&apos;s nothing to add a platform filter for yet.</p>
    </Card>
  );
}
