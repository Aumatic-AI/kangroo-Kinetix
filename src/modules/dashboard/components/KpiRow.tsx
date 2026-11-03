import { Users, TrendingUp, Megaphone, Wallet, UserRound, Heart } from "lucide-react";
import { KpiTile, ACCENT } from "@/components/global/DashboardKit";
import { FEATURES } from "@/config/features";
import { RootDashboardData } from "../hooks/useDashboard";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function KpiRow({ kpis }: { kpis: RootDashboardData["kpis"] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiTile compact icon={Users} accent={ACCENT.purple} value={fmt(kpis.totalLeads)} label="Total leads" />
      <KpiTile compact icon={TrendingUp} accent={ACCENT.blue} value={fmt(kpis.totalReach)} label={FEATURES.metaAds ? "Total reach (Meta + Social)" : "Total reach"} />
      {FEATURES.metaAds && <KpiTile compact icon={Megaphone} accent={ACCENT.purple} value={kpis.metaActiveCampaigns} label="Meta active campaigns" />}
      {FEATURES.metaAds && <KpiTile compact icon={Wallet} accent={ACCENT.purple} value={formatCents(kpis.metaSpendCents)} label="Meta ad spend" />}
      <KpiTile compact icon={UserRound} accent={ACCENT.green} value={fmt(kpis.socialFollowers)} label="Social followers" />
      <KpiTile compact icon={Heart} accent={ACCENT.green} value={fmt(kpis.socialEngagement)} label="Social engagement" />
    </div>
  );
}
