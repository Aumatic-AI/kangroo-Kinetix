import { DollarSign, Eye, MousePointerClick, Percent } from "lucide-react";
import { ACCENT, Card } from "../dashboard/shared";
import { ReportSummary } from "../../hooks/useReports";

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: { solid: string; tint: string } }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent.tint, color: accent.solid }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-text tabular-nums truncate">{value}</p>
      </div>
    </Card>
  );
}

export function ReportKpiRow({ summary }: { summary: ReportSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard icon={DollarSign} label="Spend" value={`$${summary.totalSpend.toLocaleString()}`} accent={ACCENT.purple} />
      <KpiCard icon={Eye} label="Impressions" value={summary.totalImpressions.toLocaleString()} accent={ACCENT.blue} />
      <KpiCard icon={MousePointerClick} label="Clicks" value={summary.totalClicks.toLocaleString()} accent={ACCENT.green} />
      <KpiCard icon={Percent} label="Avg CTR" value={`${summary.avgCtr}%`} accent={ACCENT.amber} />
    </div>
  );
}
