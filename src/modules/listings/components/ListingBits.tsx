"use client";
import { ReactNode, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral";

// Same token pairs as the Meta Ads StatusChip (success/warning/danger) and the
// neutral LevelChip — no new colors.
const TONE: Record<Tone, string> = {
  success: "text-success bg-success-bg border-success-border",
  warning: "text-warning bg-warning-bg border-warning-border",
  danger: "text-danger bg-danger-bg border-danger-border",
  neutral: "text-muted bg-secondary border-border",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap", TONE[tone])}>
      {children}
    </span>
  );
}

export function ListingStatusChip({ status }: { status: "active" | "inactive" }) {
  return <Pill tone={status === "active" ? "success" : "neutral"}>{status}</Pill>;
}

/** Thumbnail with the same footprint as Avatar (w-9 h-9 rounded-lg); falls back
 * to the neutral icon tile when there is no usable image or it fails to load. */
export function ListingThumb({ url, className }: { url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg bg-secondary border border-default text-muted shrink-0", className)}>
        <Building2 className="w-4 h-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("w-9 h-9 rounded-lg border border-default object-cover shrink-0 bg-secondary", className)}
    />
  );
}

/** Small-caps label + value, the same convention as the Meta Ads detail pages' InfoItem. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</p>
      <div className="text-sm font-medium text-text mt-0.5 break-words">{children}</div>
    </div>
  );
}
