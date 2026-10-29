"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Image as ImageIcon, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { CreateAdModal } from "../components/ad-library/CreateAdModal";
import { MediaPreview } from "@/components/global/MediaPreview";
import { AdCreativeCard } from "../components/ad-library/AdCreativeCard";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { PAGE_SIZE_DENSE } from "@/lib/pagination";
import { ROUTES } from "@/config/routes";

import { useQueryClient } from "@tanstack/react-query";
import { useMetaAdCreatives, useUpdateMetaAdCreative, useDeleteMetaAdCreative, useRetryMetaAdCreative, metaAdsKeys } from "../hooks/useAdLibrary";
import { MetaAdCreativeListItem } from "../types/meta-ads.types";

// Up to 5 columns of thumbnail cards — a viewport shows well more than 10
// tiles without scrolling, so the dense page size applies here.
const PAGE_SIZE = PAGE_SIZE_DENSE;

// Live updates come from useMetaAdCreatives' own conditional polling (see
// src/lib/generation-polling.ts) rather than a Supabase Realtime
// subscription — simpler (no channel lifecycle) and cheaper (no open
// websocket for the tab's whole lifetime) for a single-tenant admin tool.
export function AdLibrary() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading: loading } = useMetaAdCreatives({ page, limit: PAGE_SIZE });
  const ads = data?.items || [];
  const updateMutation = useUpdateMetaAdCreative();
  const deleteMutation = useDeleteMetaAdCreative();
  const retryMutation = useRetryMetaAdCreative();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAd, setSelectedAd] = useState<MetaAdCreativeListItem | null>(null);

  const handleApprove = async (id: string) => {
    await updateMutation.mutateAsync({ id, data: { status: "approved" } });
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const handleRetry = async (id: string) => {
    await retryMutation.mutateAsync(id);
  };

  const statusCounts = data?.statusCounts || { all: 0, review: 0, failed: 0 };

  if (loading) {
    return (
      <div className="space-y-6 pb-20">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-8 w-40 bg-surface animate-pulse rounded-lg" />
            <div className="h-4 w-24 bg-surface animate-pulse rounded-lg mt-2" />
          </div>
          <div className="h-10 w-32 bg-surface animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <div key={i} className="bg-background rounded-lg border border-border flex flex-col overflow-hidden shadow-sm">
              <div className="w-full aspect-video bg-surface border-b border-border shrink-0 animate-pulse" />
              <div className="p-3 flex flex-col flex-1 justify-between gap-3">
                <div>
                  <div className="h-3 w-3/4 bg-surface rounded mb-2 animate-pulse" />
                  <div className="h-2 w-1/2 bg-surface rounded animate-pulse" />
                </div>
                <div>
                  <div className="h-2 w-16 bg-surface rounded animate-pulse mb-3" />
                  <div className="h-7 w-full bg-surface rounded-md animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-text">Ad Creatives</h2>
          <p className="text-sm text-muted mt-1">
            {statusCounts.all} total
            {statusCounts.failed > 0 && (
              <span className="text-danger font-semibold"> · {statusCounts.failed} failed</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(ROUTES.META_ADS.AD_STUDIO)} icon={<Sparkles className="w-4 h-4" />}>
            Image Ad
          </Button>
          <Button onClick={() => setIsModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
            Create Ad
          </Button>
        </div>
      </div>


      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {ads.map((ad, idx) => (
          <AdCreativeCard
            key={ad.id}
            ad={ad}
            index={idx}
            onSelect={setSelectedAd}
            onApprove={handleApprove}
            onDelete={handleDelete}
            onRetry={handleRetry}
            isRetrying={retryMutation.isPending && retryMutation.variables === ad.id}
          />
        ))}
      </div>

      {ads.length > 0 && (
        <Pagination page={page} totalPages={data?.totalPages || 1} onPageChange={setPage} />
      )}

      {/* Empty State */}
      {ads.length === 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-24 text-center border-2 border-dashed border-default rounded-lg flex flex-col items-center"
        >
          <div className="w-16 h-16 bg-surface rounded-lg flex items-center justify-center mb-4">
            <ImageIcon className="w-8 h-8 text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text mb-2">No creatives yet</h3>
          <p className="text-muted mb-6 max-w-xs">Generate your first AI-powered ad creative to get started.</p>
          <Button
            onClick={() => setIsModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Create Your First Ad
          </Button>
        </motion.div>
      )}

      <CreateAdModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: metaAdsKeys.all })}
      />

      <MediaPreview
        open={!!selectedAd}
        onClose={() => setSelectedAd(null)}
        mediaUrl={selectedAd?.media_urls?.[0] || null}
        type={selectedAd?.type === "video" ? "video" : "image"}
        duration={selectedAd?.duration}
        aspectRatio={selectedAd?.aspect_ratio ? selectedAd.aspect_ratio.replace(":", "/") : undefined}
      />
    </div>
  );
}
