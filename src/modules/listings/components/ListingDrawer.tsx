"use client";
import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/Switch";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/utils/datetime";
import { cn } from "@/lib/utils";
import { useListing, useSetListingStatus } from "../hooks/useListings";
import { CONTENT_TYPE_LABEL, ENVIRONMENT_LABEL, PIPELINE_LABEL } from "../lib/listings";
import type { ListingDetail, ListingPromotion, ListingContentItem } from "../types/listings.types";
import { Field, ListingStatusChip, ListingThumb, Pill } from "./ListingBits";

const NOT_VERIFIED = <span className="text-muted font-normal">Not verified</span>;

const PROMOTION_TONE: Record<ListingPromotion["status"], "success" | "warning" | "danger" | "neutral"> = {
  generated: "success", claimed: "warning", failed: "danger", released: "neutral",
};
const GENERATION_TONE: Record<ListingContentItem["generationStatus"], "success" | "warning" | "danger" | "neutral"> = {
  completed: "success", processing: "warning", pending: "warning", failed: "danger", cancelled: "neutral",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-text">{children}</h3>;
}

function Gallery({ listing }: { listing: ListingDetail }) {
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const images = listing.images;
  const current = images[Math.min(index, images.length - 1)];

  if (images.length === 0) {
    return <div className="py-10 text-center border border-default rounded-2xl border-dashed text-sm text-muted">No reference images for this listing.</div>;
  }
  return (
    <div className="space-y-3">
      <div className="aspect-video w-full rounded-lg border border-default bg-surface overflow-hidden flex items-center justify-center">
        {broken.has(current.id) || current.validationStatus === "broken" ? (
          <p className="text-sm text-muted">This image could not be loaded.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.url}
            alt={`${listing.title} — image ${current.position}`}
            referrerPolicy="no-referrer"
            onError={() => setBroken((s) => new Set(s).add(current.id))}
            className="w-full h-full object-contain"
          />
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${img.position}`}
              aria-current={i === index}
              className={cn("rounded-lg border transition-colors", i === index ? "border-primary" : "border-default hover:border-border")}
            >
              <ListingThumb url={img.url} className="w-16 h-16 border-0" />
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">Image {current.position} of {images.length}</p>
    </div>
  );
}

function RotationSection({ listing }: { listing: ListingDetail }) {
  const [target, setTarget] = useState<"active" | "inactive" | null>(null);
  const setStatus = useSetListingStatus();
  const active = listing.status === "active";
  const byEnv = (env: "live" | "testing") => listing.stats.find((s) => s.environment === env);

  const confirm = async () => {
    if (!target) return;
    try {
      await setStatus.mutateAsync({ id: listing.id, status: target });
      setTarget(null);
    } catch {
      /* surfaced inline via setStatus.error; the dialog stays open to retry */
    }
  };

  return (
    <section className="space-y-4">
      <SectionTitle>Rotation</SectionTitle>
      <div className="flex items-center justify-between gap-4 border border-default rounded-lg p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Included in rotation</p>
          <p className="text-xs text-muted mt-0.5">
            {listing.eligibility.eligible
              ? "Eligible to be picked for upcoming content."
              : `Not eligible: ${listing.eligibility.reason}.`}
          </p>
        </div>
        <Switch
          checked={active}
          onCheckedChange={(next) => { setStatus.reset(); setTarget(next ? "active" : "inactive"); }}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Rotation position">#{listing.rotationSeq}</Field>
        <Field label="Last promoted">{formatDate(listing.lastPromotedAt)}</Field>
        <Field label="Status"><ListingStatusChip status={listing.status} /></Field>
      </div>

      <div className="border border-default rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Environment</TableHead>
              <TableHead className="text-right">Promoted</TableHead>
              <TableHead className="text-right">Social</TableHead>
              <TableHead className="text-right">LinkedIn</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(["live", "testing"] as const).map((env) => {
              const s = byEnv(env);
              return (
                <TableRow key={env}>
                  <TableCell className="font-medium text-text">{ENVIRONMENT_LABEL[env]}</TableCell>
                  <TableCell className="text-right tabular-nums">{s?.generatedCount ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{s?.socialGeneratedCount ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{s?.linkedinGeneratedCount ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{s?.failedGenerationCount ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{s?.publishedContentCount ?? 0}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ConfirmModal
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={target === "inactive" ? "Deactivate this listing?" : "Include this listing in rotation?"}
        description={
          target === "inactive"
            ? "It will be skipped by the rotation and no new content will be generated for it. Existing content and history are kept, and posts already scheduled for it will not be published."
            : "It becomes eligible for the rotation again, based on its previous promotion history. It still needs at least one usable image to be picked."
        }
        confirmLabel={target === "inactive" ? "Deactivate" : "Activate"}
        loading={setStatus.isPending}
        error={setStatus.error?.message}
        onConfirm={confirm}
      />
    </section>
  );
}

function History({ listing }: { listing: ListingDetail }) {
  return (
    <>
      <section className="space-y-3">
        <SectionTitle>Promotion history</SectionTitle>
        {listing.promotions.length === 0 ? (
          <p className="text-sm text-muted">Not promoted yet.</p>
        ) : (
          <div className="border border-default rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.promotions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.generatedAt ?? p.claimedAt)}</TableCell>
                    <TableCell className="text-muted">{ENVIRONMENT_LABEL[p.environment]}</TableCell>
                    <TableCell className="text-muted">{PIPELINE_LABEL[p.pipelineType]}</TableCell>
                    <TableCell title={p.failureReason ?? undefined}><Pill tone={PROMOTION_TONE[p.status]}>{p.status}</Pill></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>Content history</SectionTitle>
        {listing.content.length === 0 ? (
          <p className="text-sm text-muted">No content generated for this listing yet.</p>
        ) : (
          <div className="border border-default rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.content.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.createdAt)}</TableCell>
                    <TableCell className="text-muted">{CONTENT_TYPE_LABEL[c.contentType]}</TableCell>
                    <TableCell className="text-muted">{ENVIRONMENT_LABEL[c.environment]}</TableCell>
                    <TableCell><Pill tone={GENERATION_TONE[c.generationStatus]}>{c.archived ? "archived" : c.generationStatus}</Pill></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}

function ListingBody({ listing }: { listing: ListingDetail }) {
  const location = [listing.city, listing.region, listing.country].filter(Boolean).join(", ");
  return (
    <>
      <Gallery listing={listing} />

      <section className="space-y-4">
        <SectionTitle>Details</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">{listing.spaceCategory ?? "—"}</Field>
          <Field label="City">{listing.city ?? "—"}</Field>
          <Field label="Region">{listing.region ?? NOT_VERIFIED}</Field>
          <Field label="Country">{listing.country ?? NOT_VERIFIED}</Field>
          <Field label="Timezone">{listing.timezone ?? NOT_VERIFIED}</Field>
          <Field label="Location check">
            <Pill tone={listing.locationVerified === "verified" ? "success" : listing.locationVerified === "ambiguous" ? "warning" : "neutral"}>
              {listing.locationVerified}
            </Pill>
          </Field>
        </div>
        {location && listing.locationRaw && listing.locationRaw !== listing.city && (
          <p className="text-xs text-muted">Source location: {listing.locationRaw}</p>
        )}
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Supported events</p>
          {listing.eventTypes.length === 0 ? (
            <p className="text-sm text-muted mt-1">None listed.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {listing.eventTypes.map((e) => <Pill key={e}>{e}</Pill>)}
            </div>
          )}
        </div>
      </section>

      <RotationSection listing={listing} />
      <History listing={listing} />
    </>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="aspect-video w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
      <Skeleton className="h-24 rounded-lg" />
    </div>
  );
}

/** Opens from a Listings row: images first, then everything we know about the
 * listing. Keyed per listing so the gallery selection resets between rows. */
export function ListingDrawer({ listingId, title, onClose }: { listingId: string | null; title?: string; onClose: () => void }) {
  const { data: listing, isLoading, error } = useListing(listingId);
  return (
    <Drawer open={!!listingId} onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:sm:[--drawer-content-width:800px]">
        <DrawerHeader>
          <DrawerTitle>{listing?.title ?? title ?? "Listing"}</DrawerTitle>
          <DrawerDescription>
            {listing ? [listing.spaceCategory, listing.city].filter(Boolean).join(" · ") || "Listing details" : "Loading listing…"}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-8">
          {isLoading ? (
            <DrawerSkeleton />
          ) : error ? (
            <p className="text-sm text-danger font-medium">{error.message}</p>
          ) : listing ? (
            <ListingBody key={listing.id} listing={listing} />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
