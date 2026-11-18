import Link from "next/link";
import { Bot, ExternalLink } from "lucide-react";
import { ACCENT, Card, SectionTitle, EmptyState } from "@/components/global/DashboardKit";
import { Pill } from "@/modules/listings/components/ListingBits";
import { PLATFORM_LABEL, formatSlot } from "@/modules/content/lib/format";
import { ROUTES } from "@/config/routes";
import type { DashboardData } from "../types";

const when = (at: string, timezone: string) => formatSlot({ scheduled_at: at, timezone });

function Row({ platform, title, right }: { platform: string; title: string; right: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{PLATFORM_LABEL[platform] ?? platform}</p>
        {title && <p className="text-xs text-muted truncate">{title}</p>}
      </div>
      <div className="text-xs text-muted text-right whitespace-nowrap">{right}</div>
    </li>
  );
}

/** Content automation at a glance: mode, the weekly run, this week's progress, what's next and what just went out. */
export function AutomationCard({ automation, error }: { automation: DashboardData["automation"]; error: string | null }) {
  return (
    <Card>
      <SectionTitle
        icon={Bot}
        accent={ACCENT.purple}
        title="Content Automation"
        trailing={<Link href={ROUTES.CONTENT.AUTOMATION} className="text-xs font-medium text-text underline underline-offset-2">Settings</Link>}
      />
      {error ? (
        <p className="text-sm text-danger font-medium py-2">Couldn&apos;t load the automation status: {error}</p>
      ) : !automation ? (
        <EmptyState message="Automation hasn't been set up yet." />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Pill tone={automation.mode === "live" ? "success" : "warning"}>{automation.mode === "live" ? "Live" : "Testing"}</Pill>
            {!automation.isEnabled && <Pill tone="warning">Paused</Pill>}
            <span className="text-muted">
              {automation.nextRunAt
                ? `Next weekly run ${when(automation.nextRunAt, "America/Toronto")}`
                : automation.autoRunEnabled ? "Weekly runs are on, but automation is paused" : "Weekly runs are off"}
            </span>
            {automation.cycle && automation.cycle.total > 0 && (
              <span className="text-muted">
                · Week of {automation.cycle.weekStart}: {automation.cycle.completed}/{automation.cycle.total} generated
                {automation.cycle.inProgress ? `, ${automation.cycle.inProgress} in progress` : ""}
                {automation.cycle.failed ? `, ${automation.cycle.failed} failed` : ""}
                {automation.cycle.environment === "testing" ? " (Testing)" : ""}
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted mb-1">Up next</p>
              {automation.upcoming.length ? (
                <ul>
                  {automation.upcoming.map((u) => (
                    <Row key={`${u.contentId}-${u.platform}`} platform={u.platform} title={u.title}
                      right={<>{when(u.at, u.timezone)}{u.held && <div><Pill tone="warning">On hold</Pill></div>}</>} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted py-2">{automation.mode === "live" ? "Nothing scheduled yet." : "Nothing is scheduled in Testing mode."}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted mb-1">Recently published</p>
              {automation.recent.length ? (
                <ul>
                  {automation.recent.map((r) => (
                    <Row key={`${r.contentId}-${r.platform}-${r.at}`} platform={r.platform} title={r.title}
                      right={
                        <span className="flex items-center gap-2 justify-end">
                          {when(r.at, automation.timezone)}
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" title="View post" className="text-text">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </span>
                      } />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted py-2">Nothing published by automation yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
