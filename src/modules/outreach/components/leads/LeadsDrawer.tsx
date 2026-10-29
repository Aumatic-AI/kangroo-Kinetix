"use client";
import { Loader2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { LeadsTable } from "./LeadsTable";
import { useInfiniteMetaCampaignLeads } from "@/modules/outreach/hooks/useLeads";
import { MetaCampaignLeadBreakdown } from "@/modules/outreach/types/leads.types";

const PAGE_LIMIT = 30;
// Start fetching the next page this many pixels before the scroll container
// actually bottoms out, so new rows are ready before the user hits the end.
const SCROLL_THRESHOLD_PX = 150;

export function LeadsDrawer({ campaign, onClose }: { campaign: MetaCampaignLeadBreakdown | null; onClose: () => void }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMetaCampaignLeads(campaign?.campaignName, PAGE_LIMIT);
  const leads = data?.pages.flatMap((page) => page.leads) || [];

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD_PX;
    if (nearBottom && hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return (
    <Drawer open={!!campaign} onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:sm:[--drawer-content-width:800px]">
        <DrawerHeader>
          <DrawerTitle>{campaign?.campaignName}</DrawerTitle>
          <DrawerDescription>{campaign?.totalLeads ?? 0} lead{campaign?.totalLeads === 1 ? "" : "s"} from this Meta Ads campaign.</DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-4" onScroll={handleScroll}>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-surface animate-pulse" />)}</div>
          ) : (
            <>
              <LeadsTable leads={leads} />
              {isFetchingNextPage && (
                <div className="flex justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted" />
                </div>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
