import { TrendingUp, UserRound, Heart } from "lucide-react";
import { KpiTile, ACCENT } from "@/components/global/DashboardKit";
import { RootDashboardData } from "../hooks/useDashboard";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

export function KpiRow({ kpis }: { kpis: RootDashboardData["kpis"] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <KpiTile compact icon={TrendingUp} accent={ACCENT.blue} value={fmt(kpis.totalReach)} label="Total reach" />
      <KpiTile compact icon={UserRound} accent={ACCENT.green} value={fmt(kpis.socialFollowers)} label="Social followers" />
      <KpiTile compact icon={Heart} accent={ACCENT.green} value={fmt(kpis.socialEngagement)} label="Social engagement" />
    </div>
  );
}
