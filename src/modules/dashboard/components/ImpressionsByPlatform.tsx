import { Eye } from "lucide-react";
import { ACCENT, SectionTitle, Card, EmptyState } from "@/components/global/DashboardKit";
import { platformMeta, formatFollowerCount } from "@/modules/social/lib/platforms";
import type { DashboardData } from "../types";

type SocialDashboardData = DashboardData["analytics"];

/** Same proportional-bar treatment as the Platforms card, one metric —
 * which platform is actually driving your impressions, from the same
 * total-impressions call that already powers the trend chart above. */
export function ImpressionsByPlatform({ data, rangeLabel }: { data: SocialDashboardData["impressionsByPlatform"] | undefined; rangeLabel: string }) {
  const sorted = [...(data || [])].filter((d) => d.impressions > 0);
  const max = Math.max(...sorted.map((d) => d.impressions), 1);

  return (
    <Card>
      <SectionTitle icon={Eye} accent={ACCENT.blue} title="Impressions by Platform" trailing={<span className="text-xs text-muted">last {rangeLabel}</span>} />
      {!sorted.length ? (
        <EmptyState message="No impressions yet." />
      ) : (
        <div className="space-y-4">
          {sorted.map((d) => {
            const meta = platformMeta(d.platform);
            const Icon = meta?.icon;
            const pct = Math.round((d.impressions / max) * 100);
            return (
              <div key={d.platform} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: meta?.color || "var(--color-text-secondary)" }}>
                  {Icon ? <Icon className="w-4 h-4" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-text">{meta?.label || d.platform}</span>
                    <span className="font-bold text-text tabular-nums">{formatFollowerCount(d.impressions)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta?.color || ACCENT.blue.solid }} />
                  </div>
                </div>
              </div>
            );
          })}
          {sorted.some((d) => d.platform === "facebook") && (
            <p className="text-xs text-muted">Facebook reports a rolling 30-day figure each day, so over a range its total is overstated (Upload-Post&apos;s own caveat).</p>
          )}
        </div>
      )}
    </Card>
  );
}
