import Link from "next/link";
import { Image as ImageIcon, ChevronRight } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ROUTES } from "@/config/routes";
import { MetaAdsDashboardData } from "../../hooks/useDashboard";

type ScoredAd = MetaAdsDashboardData["scoreBuckets"][number]["ads"][number];

function AdRow({ ad }: { ad: ScoredAd }) {
  const content = (
    <div className="flex items-center gap-3 px-6 py-3.5 border-b border-default last:border-b-0">
      <div className="w-10 h-10 rounded-md bg-surface overflow-hidden shrink-0 flex items-center justify-center">
        {ad.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.mediaUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-4 h-4 text-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{ad.adText || ad.metaAdId}</p>
        <p className="text-xs text-muted mt-0.5">
          {ad.ctr.toFixed(2)}% CTR · ${(ad.spendCents / 100).toFixed(2)} spent · {ad.clicks} clicks · {ad.daysRunning}d running
        </p>
      </div>
      {ad.link ? (
        <ChevronRight className="w-4 h-4 text-muted shrink-0" />
      ) : (
        <span className="text-[10px] font-semibold text-muted/70 uppercase shrink-0">Not in Kinetix</span>
      )}
    </div>
  );

  if (!ad.link) return content;

  return (
    <Link href={ROUTES.META_ADS.AD_DETAIL(ad.link.campaignId, ad.link.adSetId, ad.link.adId)} className="block hover:bg-surface transition-colors">
      {content}
    </Link>
  );
}

export function ScoreBucketDrawer({
  open,
  onClose,
  label,
  ads,
}: {
  open: boolean;
  onClose: () => void;
  label: string | null;
  ads: ScoredAd[];
}) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:sm:[--drawer-content-width:440px]">
        <DrawerHeader>
          <DrawerTitle>{label} Ads</DrawerTitle>
          <p className="text-xs text-muted">{ads.length} ad{ads.length === 1 ? "" : "s"} — sorted by CTR</p>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto mt-2">
          {ads.map((ad) => (
            <AdRow key={ad.metaAdId} ad={ad} />
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
