"use client";
import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, ExternalLink, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlatformMeta, formatFollowerCount } from "../../lib/platforms";

export interface PlatformCardConnection {
  display_name: string | null;
  metadata: any;
}

interface PlatformCardProps {
  meta: PlatformMeta;
  connection?: PlatformCardConnection;
  /** Shown in the "not connected" empty state — omit when the card is only
   * ever rendered already-connected (e.g. the Publish flow, which filters
   * to connected accounts before rendering). */
  description?: string;
  /** Pass to make the card a selectable tile (Publish flow). Omit for a
   * plain status display (Connected Accounts). */
  selected?: boolean;
  onClick?: () => void;
  /** Greys the card out and drops the selection checkbox — e.g. a
   * connected account that doesn't support this post's media format. */
  disabled?: boolean;
  /** Replaces the "Connected" status line, e.g. "Already posted" or
   * "Doesn't support video". */
  statusOverride?: string;
}

/** The exact card used on Connected Accounts — colored icon badge, name +
 * status, then a nested avatar/name/follower-count row — reused as-is for
 * the Publish flow's platform picker so both places show identically. */
export function PlatformCard({ meta, connection, description, selected, onClick, disabled, statusOverride }: PlatformCardProps) {
  const Icon = meta.icon;
  const isConnected = !!connection;
  const followerCount = formatFollowerCount(connection?.metadata?.followers ?? connection?.metadata?.subscribers);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarUrl = avatarFailed ? undefined : connection?.metadata?.avatarUrl;
  const interactive = !!onClick && !disabled;

  return (
    <div
      onClick={interactive ? onClick : undefined}
      className={cn(
        "relative bg-background border border-default/60 rounded-2xl p-5 shadow-sm overflow-hidden transition-shadow",
        interactive ? "cursor-pointer hover:shadow-md" : "",
        disabled ? "opacity-50" : ""
      )}
    >
      {selected !== undefined && !disabled && (
        selected ? (
          <CheckCircle2 className="w-5 h-5 absolute top-4 left-4 text-success" />
        ) : (
          <span className="w-4 h-4 absolute top-4 left-4 rounded-full border-2 border-default" />
        )
      )}

      <div className="relative flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: meta.color }}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[15px] font-bold text-text leading-tight">{meta.label}</p>
            {isConnected ? (
              <span className={cn("flex items-center gap-1 text-[11px] font-semibold mt-0.5", statusOverride ? "text-muted" : "text-success")}>
                {!statusOverride && <CheckCircle2 className="w-3 h-3" />} {statusOverride || "Connected"}
              </span>
            ) : (
              <span className="text-[11px] text-muted mt-0.5 block">Not connected</span>
            )}
          </div>
        </div>
      </div>

      {isConnected ? (
        <div className="relative flex items-center gap-2.5 bg-surface rounded-xl p-2.5">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={32}
              height={32}
              onError={() => setAvatarFailed(true)}
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-subtle text-primary flex items-center justify-center shrink-0 text-xs font-bold">
              {connection?.display_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {connection?.metadata?.profileUrl ? (
              <a
                href={connection.metadata.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs font-semibold text-text hover:text-primary transition-colors group/link"
              >
                <span className="truncate">{connection?.display_name || "Connected account"}</span>
                <ExternalLink className="w-3 h-3 shrink-0 text-muted group-hover/link:text-primary transition-colors" />
              </a>
            ) : (
              <p className="text-xs font-semibold text-text truncate">{connection?.display_name || "Connected account"}</p>
            )}
            {followerCount && (
              <p className="text-[11px] text-muted flex items-center gap-1">
                <Users className="w-3 h-3" /> {followerCount}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="relative text-xs text-muted leading-snug min-h-[32px]">{description}</p>
      )}
    </div>
  );
}
