"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TabSwitch } from "@/components/global/TabSwitch";
import { PostGroup } from "../../lib/postGroups";
import { platformMeta } from "../../lib/platforms";
import { PlatformPreview } from "./previews";
import { formatDateTime } from "@/utils/datetime";

interface PostDetailsModalProps {
  group: PostGroup | null;
  onClose: () => void;
}

function statusLabel(row: PostGroup["rows"][number]): string {
  if (row.status === "published") return `Published ${formatDateTime(row.published_at)}`;
  if (row.status === "scheduled") return `Scheduled for ${formatDateTime(row.scheduled_at)}`;
  if (row.status === "failed") return "Failed";
  if (row.status === "draft") return "Draft — not posted yet";
  return row.status.charAt(0).toUpperCase() + row.status.slice(1);
}

export function PostDetailsModal({ group, onClose }: PostDetailsModalProps) {
  // Not reset via an effect on group change — a previous group's selected
  // row id practically never matches an id in a different group (they're
  // UUIDs), so this naturally falls back to the new group's first row.
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const activeRow = (selectedRowId && group?.rows.find((row) => row.id === selectedRowId)) || group?.rows[0];
  const activeMeta = activeRow?.platform_connections ? platformMeta(activeRow.platform_connections.platform) : undefined;

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-background border-border text-text p-0 rounded-2xl gap-0 overflow-hidden outline-none flex flex-col max-h-[88vh]">
        {group && (
          <>
            <DialogHeader className="px-7 py-5 border-b border-border shrink-0 bg-surface">
              <DialogTitle className="text-xl font-bold text-text">Post details</DialogTitle>
              <DialogDescription className="text-xs text-muted mt-0.5">Exactly how this looks on each platform.</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-7 space-y-5">
              <TabSwitch
                items={group.rows.map((row) => {
                  const meta = row.platform_connections ? platformMeta(row.platform_connections.platform) : undefined;
                  const Icon = meta?.icon;
                  return {
                    value: row.id,
                    label: (
                      <span className="flex items-center gap-1.5">
                        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: meta?.color }} />}
                        {meta?.label || row.platform_connections?.platform || "Unknown"}
                      </span>
                    ),
                  };
                })}
                value={activeRow?.id || ""}
                onValueChange={setSelectedRowId}
              />

              {activeRow && (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted mb-3">
                    {activeRow.status === "published" && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
                    <span className="normal-case font-medium text-muted/80">{statusLabel(activeRow)}</span>
                  </div>
                  <PlatformPreview
                    platform={(activeRow.platform_connections?.platform || "facebook") as any}
                    account={{
                      displayName: activeRow.platform_connections?.display_name || activeMeta?.label || "Account",
                      avatarUrl: activeRow.platform_connections?.metadata?.avatarUrl,
                    }}
                    caption={activeRow.caption || ""}
                    title={activeRow.title || undefined}
                    mediaUrl={group.thumbnailUrl || undefined}
                    mediaType={group.mediaType === "video" ? "video" : group.mediaType === "image" ? "image" : undefined}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
