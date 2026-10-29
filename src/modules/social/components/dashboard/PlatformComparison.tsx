import { BarChart3 } from "lucide-react";
import { ACCENT, SectionTitle, Card, EmptyState } from "@/components/global/DashboardKit";
import { platformMeta, formatFollowerCount } from "../../lib/platforms";
import { SocialDashboardData } from "../../hooks/useDashboard";

/** One proportional bar per platform (followers — the one number everyone
 * intuitively understands), with reach/engagement alongside as plain
 * numbers. Deliberately not a multi-series/radar chart: three metrics on
 * wildly different scales (followers in the thousands, engagement in the
 * tens) don't share one axis in a way that's readable at a glance — plain
 * numbers next to a simple bar are. */
export function PlatformComparison({ platforms }: { platforms: SocialDashboardData["platformComparison"] }) {
  const sorted = [...platforms].sort((a, b) => b.followers - a.followers);
  const maxFollowers = Math.max(...sorted.map((p) => p.followers), 1);

  return (
    <Card>
      <SectionTitle icon={BarChart3} accent={ACCENT.purple} title="Platforms" trailing={<span className="text-xs text-muted">by followers</span>} />
      {!sorted.length ? (
        <EmptyState message="Connect an account to compare platforms here." />
      ) : (
        <div className="space-y-4">
          {sorted.map((p) => {
            const meta = platformMeta(p.platform);
            const Icon = meta?.icon;
            const pct = Math.round((p.followers / maxFollowers) * 100);
            return (
              <div key={p.platform} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: meta?.color || "var(--color-text-secondary)" }}>
                  {Icon ? <Icon className="w-4 h-4" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-text">{meta?.label || p.platform}</span>
                    <span className="font-bold text-text tabular-nums">{formatFollowerCount(p.followers)} followers</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta?.color || ACCENT.purple.solid }} />
                  </div>
                </div>
                <div className="text-right text-[11px] text-muted shrink-0 w-20 leading-tight">
                  <p>{formatFollowerCount(p.reach)} reach</p>
                  <p>{formatFollowerCount(p.engagement)} eng.</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
