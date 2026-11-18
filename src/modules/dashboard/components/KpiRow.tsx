import { Users, Eye, Heart, Radar, Link2 } from "lucide-react";
import { KpiTile, ACCENT } from "@/components/global/DashboardKit";
import type { DashboardData } from "../types";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

/** Only impressions follow the selected range; the rest are what each platform reports now — the sublabels say so. */
export function KpiRow({ kpis, rangeLabel }: { kpis: DashboardData["analytics"]["kpis"]; rangeLabel: string }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiTile tint icon={Users} accent={ACCENT.purple} value={fmt(kpis.followers)} label="Followers" sublabel="all connected accounts" />
      <KpiTile tint icon={Eye} accent={ACCENT.blue} value={fmt(kpis.impressions)} label="Impressions" sublabel={`last ${rangeLabel}`} />
      <KpiTile tint icon={Radar} accent={ACCENT.green} value={fmt(kpis.reach)} label="Reach" sublabel="unique accounts, as reported now" />
      <KpiTile tint icon={Heart} accent={ACCENT.red} value={fmt(kpis.engagement)} label="Engagement" sublabel="likes, comments, shares, saves" />
      <KpiTile tint icon={Link2} accent={ACCENT.amber} value={fmt(kpis.connectedAccounts)} label="Connected accounts" />
    </div>
  );
}
