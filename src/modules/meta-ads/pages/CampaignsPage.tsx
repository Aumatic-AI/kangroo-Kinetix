"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LucideIcon,
  Plus,
  PlayCircle,
  Layers,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PAGE_SIZE_COMPACT } from "@/lib/pagination";
import { useCampaignsList } from "../hooks/useCampaigns";
import { CampaignListItem } from "../types/meta-ads.types";
import { ROUTES } from "@/config/routes";
import { StatusChip } from "../components/campaigns/shared";

// 3-column card grid — a viewport typically shows well under 10 cards
// without scrolling, so the compact page size applies here.
const PAGE_SIZE = PAGE_SIZE_COMPACT;

/** Mirrors CampaignCard's exact shape — name/objective + status chip, then
 * the 3-stat mini row. */
function CampaignCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5 flex-1">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-2.5 w-20 rounded" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-2 bg-background rounded-md p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-3.5 w-6 rounded" />
            <Skeleton className="h-2 w-10 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Time since Meta created the campaign — not tied to its current status,
 * so this stays accurate (and isn't mislabeled as "running") for paused
 * campaigns too. */
function campaignAgeDays(createdAt: string): number {
  return Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000),
    ),
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center min-w-0">
      <div className="flex items-center gap-1 text-text">
        <Icon className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className="text-xs font-bold truncate">{value}</span>
      </div>
      <span className="text-[10px] text-muted uppercase tracking-wide truncate max-w-full">
        {label}
      </span>
    </div>
  );
}

function CampaignCard({
  campaign,
  onOpen,
}: {
  campaign: CampaignListItem;
  onOpen: () => void;
}) {
  const days = campaignAgeDays(campaign.createdAt);
  return (
    <button
      onClick={onOpen}
      className="text-left bg-surface border border-border rounded-lg p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text truncate">
            {campaign.name}
          </p>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mt-0.5">
            {campaign.objective?.replace("OUTCOME_", "") || "—"}
          </p>
        </div>
        <StatusChip status={campaign.status} />
      </div>

      <div className="grid grid-cols-3 gap-2 bg-background rounded-md p-3">
        <Stat
          icon={Layers}
          value={String(campaign.adSetCount)}
          label={campaign.adSetCount === 1 ? "ad set" : "ad sets"}
        />
        <Stat
          icon={ImageIcon}
          value={String(campaign.adCount)}
          label={campaign.adCount === 1 ? "ad" : "ads"}
        />
        <Stat
          icon={Clock}
          value={String(days)}
          label={days === 1 ? "day old" : "days old"}
        />
      </div>
    </button>
  );
}

export function CampaignsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCampaignsList(page, PAGE_SIZE);
  const campaigns = data?.campaigns || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-text">Campaigns</h2>
          <p className="text-sm text-muted mt-1">
            Launch approved creatives as live campaigns and manage everything
            that&apos;s running.
          </p>
        </div>
        <Button
          onClick={() => router.push(ROUTES.META_ADS.CAMPAIGN_CREATE)}
          icon={<Plus className="w-4 h-4" />}
        >
          New Campaign
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-default rounded-lg flex flex-col items-center">
          <div className="w-16 h-16 bg-surface rounded-lg flex items-center justify-center mb-4">
            <PlayCircle className="w-8 h-8 text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text mb-2">
            No campaigns yet
          </h3>
          <p className="text-muted mb-6 max-w-xs">
            Launch an approved creative from Ad Library, or start here.
          </p>
          <Button
            onClick={() => router.push(ROUTES.META_ADS.CAMPAIGN_CREATE)}
            icon={<Plus className="w-4 h-4" />}
          >
            New Campaign
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {campaigns.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onOpen={() => router.push(ROUTES.META_ADS.CAMPAIGN_DETAIL(c.id))}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={data?.totalPages || 1} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
