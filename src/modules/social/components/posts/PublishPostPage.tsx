"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, CheckCircle2, CalendarClock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/config/routes";
import { groupPosts, PostRow } from "../../lib/postGroups";
import { PLATFORMS, platformMeta } from "../../lib/platforms";
import { PlatformPreview } from "./previews";
import {
  useSocialPosts,
  useConnections,
  usePreparePlatforms,
  usePublishPosts,
  useImproveCaption,
  useUpdateCaption,
  PreparedPlatformRow,
} from "../../hooks/usePosts";

const STEP_NUMBER = { select: 1, preview: 2, schedule: 3 } as const;
type Step = keyof typeof STEP_NUMBER;

const STEP_COPY: Record<Step, { title: string; description: string }> = {
  select: { title: "Choose where to post", description: "Pick which accounts should get this content." },
  preview: { title: "Preview", description: "Exactly how each post will look once it's live." },
  schedule: { title: "Post or schedule", description: "Choose when this should go out." },
};

/** Text posts already have a real caption/title generated per platform at
 * creation time (no media, so nothing to re-prepare) — this just reshapes
 * the existing draft rows into PreparedPlatformRow, no network call. */
function buildPreparedFromRows(rowsToUse: PostRow[]): PreparedPlatformRow[] {
  return rowsToUse.map((r) => ({
    id: r.id,
    platform: r.platform_connections!.platform as string,
    caption: r.caption || "",
    title: r.title || undefined,
    account: {
      displayName: r.platform_connections!.display_name || (r.platform_connections!.platform as string),
      avatarUrl: r.platform_connections!.metadata?.avatarUrl,
    },
  }));
}

export function PublishPostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mediaAssetId = searchParams.get("mediaAssetId");
  const socialPostIdsParam = searchParams.get("socialPostIds");
  const socialPostIds = useMemo(() => (socialPostIdsParam ? socialPostIdsParam.split(",").filter(Boolean) : []), [socialPostIdsParam]);
  // Text posts have no media_asset_id and no "select platforms" step —
  // platforms are chosen up front in Create Post, so this page is entered
  // straight at the preview step via a socialPostIds list instead.
  const skipSelectStep = searchParams.get("step") === "preview";

  const { data: rows = [], isLoading } = useSocialPosts();
  const { data: connections = [] } = useConnections();
  const prepareMutation = usePreparePlatforms();
  const publishMutation = usePublishPosts();
  const improveMutation = useImproveCaption();
  const updateCaptionMutation = useUpdateCaption();

  const group = useMemo(() => {
    const groups = groupPosts(rows as PostRow[]);
    if (mediaAssetId) return groups.find((g) => g.mediaAssetId === mediaAssetId);
    if (socialPostIds.length) {
      const idSet = new Set(socialPostIds);
      return groups.find((g) => g.rows.some((r) => idSet.has(r.id)));
    }
    return undefined;
  }, [rows, mediaAssetId, socialPostIds]);

  const [step, setStep] = useState<Step>(skipSelectStep ? "preview" : "select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preparedRows, setPreparedRows] = useState<PreparedPlatformRow[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [improvingId, setImprovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (group && !initialized) {
      const draftRows = group.rows.filter((r) => r.status === "draft" && r.platform_connections);
      setSelected(new Set(draftRows.map((r) => r.platform_connections!.platform as string)));

      if (skipSelectStep) {
        const prepared = buildPreparedFromRows(draftRows);
        setPreparedRows(prepared);
        setCaptions(Object.fromEntries(prepared.map((r) => [r.id, r.caption])));
        setTitles(Object.fromEntries(prepared.map((r) => [r.id, r.title || ""])));
        setActiveTab(prepared[0]?.platform || "");
      }

      setInitialized(true);
    }
  }, [group, initialized, skipSelectStep]);

  const goToPosts = () => router.push(ROUTES.SOCIAL.POSTS);

  if (!mediaAssetId && !socialPostIds.length) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <p className="text-muted">No post selected to publish.</p>
        <Link href={ROUTES.SOCIAL.POSTS} className="text-primary font-semibold text-sm mt-2 inline-block">Back to Gallery</Link>
      </div>
    );
  }

  if (isLoading || !initialized) {
    return (
      <div className="space-y-6 pb-10">
        <button
          onClick={goToPosts}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-text transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Gallery
        </button>

        <Stepper
          steps={3}
          current={STEP_NUMBER[step]}
          labels={[STEP_COPY.select.title, STEP_COPY.preview.title, STEP_COPY.schedule.title]}
          className="max-w-4xl mx-auto"
        />

        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="grid grid-cols-3 gap-3 max-w-3xl">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="w-56 h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <p className="text-muted">This post couldn't be found — it may have already been published or removed.</p>
        <Link href={ROUTES.SOCIAL.POSTS} className="text-primary font-semibold text-sm mt-2 inline-block">Back to Gallery</Link>
      </div>
    );
  }

  const publishedPlatforms = new Set(group.rows.filter((r) => r.status === "published" && r.platform_connections).map((r) => r.platform_connections!.platform as string));
  const isVideo = group.format === "video";
  const options = PLATFORMS;

  const toggle = (platform: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(platform) ? next.delete(platform) : next.add(platform);
      return next;
    });
  };

  const handleNext = async () => {
    if (!selected.size) return;
    setError("");

    // Text posts already have a real caption per platform from creation —
    // no media, nothing to prepare, just carry the selected rows forward.
    if (group.format === "text") {
      const chosenRows = group.rows.filter((r) => r.platform_connections && selected.has(r.platform_connections.platform as string));
      const prepared = buildPreparedFromRows(chosenRows);
      setPreparedRows(prepared);
      setCaptions(Object.fromEntries(prepared.map((r) => [r.id, r.caption])));
      setTitles(Object.fromEntries(prepared.map((r) => [r.id, r.title || ""])));
      setActiveTab(prepared[0]?.platform || "");
      setStep("preview");
      return;
    }

    if (!group.mediaAssetId) return;
    try {
      const prepared = await prepareMutation.mutateAsync({
        mediaAssetId: group.mediaAssetId,
        ideaPrompt: group.ideaPrompt,
        format: group.format,
        platforms: [...selected],
      });
      setPreparedRows(prepared);
      setCaptions(Object.fromEntries(prepared.map((r) => [r.id, r.caption])));
      setTitles(Object.fromEntries(prepared.map((r) => [r.id, r.title || ""])));
      setActiveTab(prepared[0]?.platform || "");
      setStep("preview");
    } catch (e: any) {
      setError(e.message || "Failed to prepare platforms");
    }
  };

  const handleImprove = async (row: PreparedPlatformRow) => {
    setImprovingId(row.id);
    setError("");
    try {
      const improved = await improveMutation.mutateAsync({ platform: row.platform, caption: captions[row.id] ?? row.caption });
      setCaptions((prev) => ({ ...prev, [row.id]: improved }));
    } catch (e: any) {
      setError(e.message || "Failed to improve caption");
    } finally {
      setImprovingId(null);
    }
  };

  const handlePost = async () => {
    setError("");
    try {
      const edited = preparedRows.filter((r) =>
        (captions[r.id] !== undefined && captions[r.id] !== r.caption) ||
        (titles[r.id] !== undefined && titles[r.id] !== (r.title || ""))
      );
      if (edited.length) {
        await Promise.all(edited.map((r) => updateCaptionMutation.mutateAsync({
          id: r.id,
          caption: captions[r.id] ?? r.caption,
          title: titles[r.id] !== undefined ? titles[r.id] : r.title,
        })));
      }
      const scheduledDate = publishMode === "schedule" && scheduleDate ? scheduleDate.toISOString() : undefined;
      await publishMutation.mutateAsync({ socialPostIds: preparedRows.map((r) => r.id), scheduledDate });
      goToPosts();
    } catch (e: any) {
      setError(e.message || "Failed to publish");
    }
  };

  const goBackStep = () => {
    if (step === "schedule") return setStep("preview");
    // A text post never had a "select platforms" step to return to.
    if (skipSelectStep) return goToPosts();
    return setStep("select");
  };

  // Text posts only ever have captions for the platforms chosen back in
  // Create Post (no media, so there's no path to generate one for a brand
  // new platform here) — restrict step 1 to just those instead of every
  // connected account.
  const groupPlatforms = new Set(group.rows.filter((r) => r.platform_connections).map((r) => r.platform_connections!.platform as string));
  const connectedOptions = options.filter((p) =>
    group.format === "text" ? groupPlatforms.has(p.platform) : connections.some((c) => c.platform === p.platform)
  );

  return (
    <div className="space-y-6 pb-10">
      <button
        onClick={goToPosts}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-text transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Gallery
      </button>

      <Stepper
        steps={3}
        current={STEP_NUMBER[step]}
        labels={[STEP_COPY.select.title, STEP_COPY.preview.title, STEP_COPY.schedule.title]}
        className="max-w-4xl mx-auto"
      />

      <div>
        {step === "select" && (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="grid grid-cols-3 gap-3 max-w-3xl">
              {connectedOptions.map((p) => {
                const Icon = p.icon;
                const supportsFormat = group.format === "text" ? true : isVideo ? p.supportsVideo : p.supportsImage;
                const isSelected = selected.has(p.platform);
                const isPosted = publishedPlatforms.has(p.platform);

                return (
                  <button
                    key={p.platform}
                    type="button"
                    disabled={!supportsFormat}
                    onClick={() => supportsFormat && toggle(p.platform)}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-1.5 w-56 h-32 rounded-xl border border-default bg-background transition-all",
                      supportsFormat ? "hover:bg-surface" : "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {supportsFormat && (
                      isSelected ? (
                        <CheckCircle2 className="w-6 h-6 absolute top-2 left-2 text-success" />
                      ) : (
                        <span className="w-4 h-4 absolute top-2 left-2 rounded-full border-2 border-default" />
                      )
                    )}
                    <Icon className="w-12 h-12 shrink-0" style={{ color: p.color }} />
                    <div className="text-center min-w-0 px-2">
                      <p className="text-xs font-bold truncate text-text">{p.label}</p>
                      {(!supportsFormat || isPosted) && (
                        <p className="text-[10px] truncate text-muted">
                          {!supportsFormat ? `Doesn't support ${isVideo ? "video" : "images"}` : "Already posted"}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "preview" && (() => {
          const activeRow = preparedRows.find((row) => row.platform === activeTab);
          return (
            <div className="grid grid-cols-2 gap-8 items-start">
              <div className="flex justify-center">
                {activeRow && (
                  <PlatformPreview
                    platform={activeRow.platform as any}
                    account={activeRow.account}
                    caption={captions[activeRow.id] ?? activeRow.caption}
                    title={titles[activeRow.id] ?? activeRow.title}
                    mediaUrl={group.thumbnailUrl || undefined}
                    mediaType={group.mediaType === "video" ? "video" : group.mediaType === "image" ? "image" : undefined}
                  />
                )}
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-2 flex-wrap">
                  {preparedRows.map((row) => {
                    const meta = platformMeta(row.platform);
                    const Icon = meta?.icon;
                    const isActive = activeTab === row.platform;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setActiveTab(row.platform)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                          isActive ? "bg-secondary text-text border-secondary shadow-sm" : "border-transparent text-muted hover:bg-surface"
                        )}
                      >
                        {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: meta?.color }} />}
                        <span className="capitalize">{row.platform}</span>
                      </button>
                    );
                  })}
                </div>

                {activeRow && (
                  <div className="space-y-3.5">
                    {activeRow.platform === "youtube" && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted">Title</p>
                        <input
                          type="text"
                          value={titles[activeRow.id] ?? activeRow.title ?? ""}
                          onChange={(e) => setTitles((prev) => ({ ...prev, [activeRow.id]: e.target.value }))}
                          className="w-full h-10 px-3 rounded-lg border border-default bg-background text-text text-sm focus:outline-none"
                        />
                      </div>
                    )}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted">
                          {activeRow.platform === "youtube" ? "Description" : "Caption"}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleImprove(activeRow)}
                          disabled={improvingId === activeRow.id}
                          className="h-7 px-3 rounded-md text-xs"
                          icon={improvingId === activeRow.id ? <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        >
                          {improvingId === activeRow.id ? "Improving..." : "Improve with AI"}
                        </Button>
                      </div>
                      <Textarea
                        value={captions[activeRow.id] ?? activeRow.caption}
                        onChange={(e) => setCaptions((prev) => ({ ...prev, [activeRow.id]: e.target.value }))}
                        className="min-h-[280px] py-3 text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <Button variant="outline" onClick={goBackStep} className="rounded-lg font-semibold" icon={<ArrowLeft className="w-4 h-4" />}>
                    Back
                  </Button>
                  <Button onClick={() => setStep("schedule")} className="px-6 rounded-lg font-bold">
                    Next
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

        {step === "schedule" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
              <div className="w-[21rem] space-y-4">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setPublishMode("now")}
                    className="relative flex flex-col items-center justify-center gap-2.5 w-40 h-32 rounded-xl border border-default bg-background hover:bg-surface transition-all"
                  >
                    {publishMode === "now" ? (
                      <CheckCircle2 className="w-5 h-5 absolute top-2 left-2 text-success" />
                    ) : (
                      <span className="w-4 h-4 absolute top-2 left-2 rounded-full border-2 border-default" />
                    )}
                    <Send className="w-6 h-6 text-text" />
                    <span className="text-sm font-bold text-text">Post Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishMode("schedule")}
                    className="relative flex flex-col items-center justify-center gap-2.5 w-40 h-32 rounded-xl border border-default bg-background hover:bg-surface transition-all"
                  >
                    {publishMode === "schedule" ? (
                      <CheckCircle2 className="w-5 h-5 absolute top-2 left-2 text-success" />
                    ) : (
                      <span className="w-4 h-4 absolute top-2 left-2 rounded-full border-2 border-default" />
                    )}
                    <CalendarClock className="w-6 h-6 text-text" />
                    <span className="text-sm font-bold text-text">Schedule for Later</span>
                  </button>
                </div>

                {publishMode === "schedule" && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Date &amp; Time</p>
                    <DateTimePicker value={scheduleDate} onChange={setScheduleDate} minDate={new Date()} className="w-full" />
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Posting to</p>
                <div className="flex flex-wrap gap-2">
                  {preparedRows.map((row) => {
                    const meta = platformMeta(row.platform);
                    const Icon = meta?.icon;
                    return (
                      <span
                        key={row.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-default text-xs font-semibold text-text"
                      >
                        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta?.color }} />}
                        <span className="capitalize">{row.platform}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <Button variant="outline" onClick={goBackStep} className="rounded-lg font-semibold" icon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              <Button
                onClick={handlePost}
                disabled={publishMutation.isPending || (publishMode === "schedule" && !scheduleDate)}
                className="px-6 rounded-lg font-bold"
                icon={publishMode === "schedule" ? <CalendarClock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              >
                {publishMutation.isPending
                  ? (publishMode === "schedule" ? "Scheduling..." : "Posting...")
                  : publishMode === "schedule" ? `Schedule (${preparedRows.length})` : `Post Now (${preparedRows.length})`}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger mt-5">{error}</p>}
      </div>

      {step === "select" && (
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <span />
        <Button onClick={handleNext} disabled={!selected.size || prepareMutation.isPending} className="px-6 rounded-lg font-bold">
          {prepareMutation.isPending ? "Preparing..." : "Next"}
        </Button>
      </div>
      )}
    </div>
  );
}
