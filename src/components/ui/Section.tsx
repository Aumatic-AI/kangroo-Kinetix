import { ReactNode } from "react";

/** A grouped block of related fields — a bold title, one short line
 * explaining what the section is for, then its fields, on a subtly-shaded
 * surface so each group reads as its own panel. Originally built for the
 * Meta Ads Create Campaign wizard (still re-exported from
 * meta-ads/components/campaigns/shared.tsx for its existing consumers),
 * promoted here since the Settings page needed the identical pattern.
 * `action` is an optional control (e.g. a date-range picker) rendered at
 * the top-right of the header row, beside the title/description. */
export function Section({ title, description, action, children }: { title: ReactNode; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text flex items-center gap-2">{title}</h3>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
