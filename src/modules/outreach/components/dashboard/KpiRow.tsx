import React from "react";
import { Users, Megaphone, Send, Eye, MessageSquare, AlertTriangle } from "lucide-react";
import { KpiTile, ACCENT } from "@/components/global/DashboardKit";
import { OutreachDashboardData } from "../../hooks/useDashboard";

export function KpiRow({ kpis }: { kpis: OutreachDashboardData["kpis"] }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiTile compact icon={Users} accent={ACCENT.purple} value={kpis.totalLeads.toLocaleString()} label="Total leads" />
      <KpiTile compact icon={Megaphone} accent={ACCENT.blue} value={kpis.activeCampaigns} label="Sending now" />
      <KpiTile compact icon={Send} accent={ACCENT.green} value={kpis.totalSent.toLocaleString()} label="Emails sent" />
      <KpiTile compact icon={Eye} accent={ACCENT.blue} value={`${kpis.openRate}%`} label="Open rate" />
      <KpiTile compact icon={MessageSquare} accent={ACCENT.green} value={`${kpis.replyRate}%`} label="Reply rate" />
      <KpiTile compact icon={AlertTriangle} accent={ACCENT.red} value={`${kpis.bounceRate}%`} label="Bounce rate" />
    </div>
  );
}
