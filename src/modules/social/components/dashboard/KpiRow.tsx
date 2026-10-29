import { Users, Eye, Heart, Radar, Link2 } from "lucide-react";
import { KpiTile, ACCENT } from "@/components/global/DashboardKit";
import { SocialDashboardData } from "../../hooks/useDashboard";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

export function KpiRow({ kpis }: { kpis: SocialDashboardData["kpis"] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiTile tint icon={Users} accent={ACCENT.purple} value={fmt(kpis.totalFollowers)} label="Total followers" sublabel="live, all connected accounts" />
      <KpiTile tint icon={Eye} accent={ACCENT.blue} value={fmt(kpis.totalImpressions)} label="Impressions" sublabel="last 30 days" />
      <KpiTile tint icon={Radar} accent={ACCENT.green} value={fmt(kpis.totalReach)} label="Reach" sublabel="unique accounts reached" />
      <KpiTile tint icon={Heart} accent={ACCENT.red} value={fmt(kpis.totalEngagement)} label="Engagement" sublabel="likes, comments, shares, saves" />
      <KpiTile tint icon={Link2} accent={ACCENT.amber} value={fmt(kpis.connectedAccounts)} label="Connected accounts" />
    </div>
  );
}
