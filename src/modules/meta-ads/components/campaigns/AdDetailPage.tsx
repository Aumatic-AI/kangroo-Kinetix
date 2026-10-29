"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ROUTES } from "@/config/routes";
import { useAdDetail, useEditAdCreative } from "../../hooks/useCampaigns";
import { useLeadForm, LeadForm } from "../../hooks/useLeads";
import { CTA_TYPES } from "./shared";
import { StatusChip, LevelChip, InfoItem, MetricsRow, Section, DetailBreadcrumbSkeleton, DetailHeaderSkeleton, InfoItemSkeleton, MetricsRowSkeleton } from "./shared";
import { StatusActions } from "./StatusActions";
import { MediaPreview } from "@/components/global/MediaPreview";
import { LeadFormDetailsModal } from "../leads/LeadFormDetailsModal";

function ctaLabel(ctaType: string | null): string {
  return CTA_TYPES.find((c) => c.value === ctaType)?.label || ctaType || "—";
}

/**
 * Ad Detail — reached from the Ad Set Detail page's Ads list. Shows the
 * creative preview, every ad-copy field, and lifetime performance. Editing
 * copy creates a brand-new Meta creative and repoints this ad at it (Meta
 * creatives are immutable) — same underlying action the old Campaign
 * Details dialog's inline edit used, just on its own page now.
 */
export function AdDetailPage() {
  const { campaignId, adSetId, adId } = useParams<{ campaignId: string; adSetId: string; adId: string }>();
  const { data: ad, isLoading } = useAdDetail(adId);
  const { data: linkedForm } = useLeadForm(ad?.leadGenFormId ?? null);
  const editCreative = useEditAdCreative();
  const [previewing, setPreviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [editError, setEditError] = useState("");
  const [viewingForm, setViewingForm] = useState<LeadForm | null>(null);

  useEffect(() => {
    if (ad) {
      setHeadline(ad.headline || "");
      setPrimaryText(ad.primaryText || "");
    }
  }, [ad]);

  if (isLoading || !ad) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <DetailBreadcrumbSkeleton levels={4} />
        <DetailHeaderSkeleton actionButtons={2} />

        <div className="flex gap-6 flex-wrap sm:flex-nowrap">
          <Skeleton className="w-40 h-52 rounded-lg shrink-0" />

          <div className="flex-1 min-w-0 space-y-6">
            <Section title="Ad Copy" description="What people see, and where they go after clicking.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItemSkeleton />
                <InfoItemSkeleton />
                <InfoItemSkeleton />
                <InfoItemSkeleton />
              </div>
            </Section>

            <Section title="Performance" description="Lifetime totals, live from Meta — never a cached snapshot.">
              <MetricsRowSkeleton />
            </Section>
          </div>
        </div>
      </div>
    );
  }

  const saveEdit = async () => {
    setEditError("");
    try {
      await editCreative.mutateAsync({
        adId: ad.id,
        campaignId,
        ...(headline.trim() && headline !== ad.headline ? { headline: headline.trim() } : {}),
        ...(primaryText.trim() && primaryText !== ad.primaryText ? { primaryText: primaryText.trim() } : {}),
      });
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update ad copy");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={ROUTES.META_ADS.CAMPAIGNS} />}>Campaigns</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={ROUTES.META_ADS.CAMPAIGN_DETAIL(campaignId)} />}>{ad.campaignName}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={ROUTES.META_ADS.AD_SET_DETAIL(campaignId, adSetId)} />}>{ad.adSetName}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{ad.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <LevelChip level="ad" />
            <h2 className="text-2xl font-bold text-text truncate">{ad.name}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ad.previewShareableLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={ad.previewShareableLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                Preview on Meta
              </a>
            </Button>
          )}
          <StatusActions level="ad" id={ad.id} campaignId={campaignId} status={ad.status} showGoLive />
        </div>
      </div>

      <div className="flex gap-6 flex-wrap sm:flex-nowrap">
        {ad.mediaUrl && (
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            title="Preview"
            className="relative w-40 h-52 rounded-lg overflow-hidden bg-surface border border-border shrink-0 flex items-center justify-center"
          >
            {ad.mediaType === "video" ? (
              <video src={ad.mediaUrl} className="w-full h-full object-contain" muted preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ad.mediaUrl} alt="" className="w-full h-full object-contain" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
              {ad.mediaType === "video" && (
                <span className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <Play className="w-4 h-4 fill-current" />
                </span>
              )}
            </span>
          </button>
        )}

        <div className="flex-1 min-w-0 space-y-6">
          <Section
            title={
              <>
                Ad Copy
                <StatusChip status={ad.status} />
              </>
            }
            description="What people see, and where they go after clicking."
          >
            {!editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem label="Headline" value={ad.headline || "—"} />
                <InfoItem label="Call to Action" value={ctaLabel(ad.ctaType)} />
                <InfoItem label="Primary Text" value={<span className="whitespace-pre-wrap">{ad.primaryText || "—"}</span>} truncate={false} />
                <InfoItem
                  label={ad.leadGenFormId ? "Destination" : "Destination URL"}
                  value={
                    ad.leadGenFormId ? (
                      linkedForm ? (
                        <button type="button" onClick={() => setViewingForm(linkedForm)} className="text-primary hover:underline text-left">
                          Instant Form
                        </button>
                      ) : (
                        "Instant Form"
                      )
                    ) : ad.destinationUrl ? (
                      <a href={ad.destinationUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                        {ad.destinationUrl}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                {ad.description && <div className="sm:col-span-2"><InfoItem label="Description" value={ad.description} /></div>}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wide">Headline</label>
                  <Input value={headline} onChange={(e) => setHeadline(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wide">Primary Text</label>
                  <Textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} rows={3} className="mt-1.5" />
                </div>
                <p className="text-[11px] text-muted">Meta creatives are immutable, so saving creates a new one and repoints this ad.</p>
                {editError && <p className="text-sm text-danger font-medium">{editError}</p>}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditError(""); }}>Cancel</Button>
                  <Button size="sm" loading={editCreative.isPending} onClick={saveEdit}>Save as New Creative</Button>
                </div>
              </div>
            )}
            {/* Edit Copy hidden for now */}
            {false && !editing && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit Copy</Button>
              </div>
            )}
          </Section>

          <Section title="Performance" description="Lifetime totals, live from Meta — never a cached snapshot.">
            <MetricsRow metrics={ad.metrics} showLeads={!!ad.leadGenFormId} />
          </Section>
        </div>
      </div>

      <MediaPreview open={previewing} onClose={() => setPreviewing(false)} mediaUrl={ad.mediaUrl || null} type={ad.mediaType} />
      <LeadFormDetailsModal form={viewingForm} onClose={() => setViewingForm(null)} />
    </div>
  );
}
