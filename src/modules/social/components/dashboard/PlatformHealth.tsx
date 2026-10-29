import { Link2 } from "lucide-react";
import { ACCENT, SectionTitle, Card } from "@/components/global/DashboardKit";
import { platformMeta } from "../../lib/platforms";
import { SocialDashboardData } from "../../hooks/useDashboard";

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  connected: { label: "Connected", className: "text-success bg-success-bg" },
  expired: { label: "Expired", className: "text-warning bg-warning-bg" },
  revoked: { label: "Revoked", className: "text-danger bg-danger-bg" },
  error: { label: "Error", className: "text-danger bg-danger-bg" },
  not_connected: { label: "Not connected", className: "text-muted bg-surface" },
};

export function PlatformHealth({ platforms }: { platforms: SocialDashboardData["platformHealth"] }) {
  return (
    <Card>
      <SectionTitle icon={Link2} accent={ACCENT.blue} title="Platform Health" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {platforms.map((p) => {
          const meta = platformMeta(p.platform);
          const Icon = meta?.icon;
          const status = STATUS_STYLE[p.status] || STATUS_STYLE.not_connected;
          return (
            <div key={p.platform} className="flex flex-col items-center gap-2 text-center">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: meta?.color || "var(--color-text-secondary)" }}>
                {Icon ? <Icon className="w-4 h-4" /> : null}
              </div>
              <p className="text-xs font-semibold text-text">{meta?.label || p.platform}</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
