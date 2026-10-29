import { Users, TrendingUp, Megaphone, Wallet, MessageSquare, Send, UserRound, Heart } from "lucide-react";
import { KpiTile, ACCENT } from "@/components/global/DashboardKit";
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
      <KpiTile compact icon={Users} accent={ACCENT.purple} value={fmt(kpis.totalLeads)} label="Total leads (Meta + Outreach)" />
      <KpiTile compact icon={TrendingUp} accent={ACCENT.blue} value={fmt(kpis.totalReach)} label="Total reach (Meta + Social)" />
      <KpiTile compact icon={Megaphone} accent={ACCENT.purple} value={kpis.metaActiveCampaigns} label="Meta active campaigns" />
      <KpiTile compact icon={Wallet} accent={ACCENT.purple} value={formatCents(kpis.metaSpendCents)} label="Meta ad spend" />
      <KpiTile compact icon={MessageSquare} accent={ACCENT.blue} value={`${kpis.outreachReplyRate}%`} label="Outreach reply rate" />
      <KpiTile compact icon={Send} accent={ACCENT.blue} value={kpis.outreachSendingNow} label="Outreach sending now" />
      <KpiTile compact icon={UserRound} accent={ACCENT.green} value={fmt(kpis.socialFollowers)} label="Social followers" />
      <KpiTile compact icon={Heart} accent={ACCENT.green} value={fmt(kpis.socialEngagement)} label="Social engagement" />
    </div>
  );
}
