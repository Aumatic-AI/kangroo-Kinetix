"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader } from "@/components/ui/Loader";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/datetime";
import { Pill, Field } from "@/modules/listings/components/ListingBits";
import { useContentDetail, useRegenerate } from "../hooks/useContent";
import { PLATFORM_LABEL, TYPE_LABEL, describeMedia, formatSlot } from "../lib/format";
import { BlogView } from "./BlogView";
import { GenerationChip, MediaPreview } from "./ContentBits";
import type { ContentDetail, RevisionSummary } from "../types/content.types";

const VALIDATION_TONE = { valid: "success", pending: "warning", invalid: "danger" } as const;

/** "problem_aware" → "Problem aware". */
const humanize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "");

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-text">{children}</h3>;
}

function Body({ detail }: { detail: ContentDetail }) {
  const { item, revisions, clips, decision } = detail;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [guidance, setGuidance] = useState("");
  const regenerate = useRegenerate();

  // ONE version is shown (product decision): the current one — a regeneration replaces it here once it
  // completes — or, with no completed version yet, the newest attempt. Earlier versions are not listed.
  const newest = revisions.reduce<RevisionSummary | undefined>((a, r) => (!a || r.number > a.number ? r : a), undefined);
  const rev: RevisionSummary | undefined = item.current ?? newest;
  const revClips = rev ? clips[rev.id] ?? [] : [];
  const isBlog = item.contentType === "blog";
  const busy = item.generationStatus === "processing" || item.regenerating;
  const canRegenerate = !busy && (item.generationStatus === "completed" || item.generationStatus === "failed");

  const confirm = async () => {
    try {
      await regenerate.mutateAsync({ contentId: item.id, prompt: guidance.trim() || undefined });
      setConfirmOpen(false);
      setGuidance("");
    } catch {
      /* shown inline in the dialog */
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <GenerationChip status={item.generationStatus} />
        <Pill>{TYPE_LABEL[item.contentType]}</Pill>
        {!isBlog && <Pill>{item.pipeline === "linkedin" ? "LinkedIn" : "Social"}</Pill>}
        <Pill tone={item.environment === "testing" ? "warning" : "success"}>{item.environment === "testing" ? "Testing — not published" : "Live"}</Pill>
        {busy && <span className="flex items-center gap-2 text-xs text-muted"><Loader size="sm" />{item.regenerating ? "Regenerating…" : "Generating…"}</span>}
        <div className="ml-auto">
          <Button size="sm" variant="outline" disabled={!canRegenerate} onClick={() => setConfirmOpen(true)}>
            <RefreshCw /> Regenerate
          </Button>
        </div>
      </div>

      {rev && !isBlog && (
        <MediaPreview
          url={rev.mediaUrl} mediaType={rev.mediaType} contentType={item.contentType} controls
          className={cn("w-full rounded-lg border border-default", item.contentType === "video" ? "aspect-[9/16] max-h-[560px] object-contain" : "aspect-square object-contain")}
        />
      )}

      {rev && (
        <div className="space-y-4">
          <SectionTitle>Content</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Property">{item.propertyTitle}{item.city ? <span className="text-muted font-normal"> · {item.city}</span> : null}</Field>
            <Field label="Generated">{formatDateTime(rev.createdAt)}</Field>
            {item.contentType === "video" && (
              <Field label="Video">
                {rev.videoFormat ? `Single clip${rev.videoDuration ? ` · ${rev.videoDuration}s` : ""}` : "—"}
              </Field>
            )}
            <Field label="Checks"><Pill tone={VALIDATION_TONE[rev.validation]}>{rev.validation}</Pill></Field>
          </div>
          {rev.validationErrors && rev.validationErrors.length > 0 && (
            <ul className="text-xs text-danger list-disc pl-5 space-y-0.5">{rev.validationErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          )}
          {rev.caption && !isBlog && <Field label={item.contentType === "text_image" ? "Post text" : "Caption"}><span className="whitespace-pre-wrap font-normal">{rev.caption}</span></Field>}
          {rev.hashtags.length > 0 && !isBlog && <Field label="Hashtags"><span className="font-normal text-muted">{rev.hashtags.map((h) => `#${h}`).join(" ")}</span></Field>}
          {rev.script && item.contentType !== "text_image" && !isBlog && <Field label="Script"><span className="whitespace-pre-wrap font-normal">{rev.script}</span></Field>}
          {rev.guidance && <Field label="Regeneration note"><span className="font-normal">{rev.guidance}</span></Field>}
        </div>
      )}

      {isBlog && rev && (
        rev.blog ? (
          <BlogView blog={rev.blog} heroUrl={rev.mediaUrl} markdown={rev.caption} />
        ) : (
          <p className="text-sm text-muted">{rev.validation === "pending" ? "The blog post is still being written…" : "This revision has no blog content."}</p>
        )
      )}

      {rev?.qa && (
        <div className="space-y-3">
          <SectionTitle>Quality checks</SectionTitle>
          {rev.qa.assignment && (
            <Field label="Weekly mix">
              <span className="font-normal">
                {humanize(rev.qa.assignment.objective)} · {humanize(rev.qa.assignment.framework)} framework · {humanize(rev.qa.assignment.hookType)} hook
              </span>
            </Field>
          )}
          {rev.qa.brief && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Pill tone={rev.qa.brief.passed ? "success" : "danger"}>{rev.qa.brief.passed ? "Passed" : "Failed"}</Pill>
                <p className="text-sm text-text">
                  <span className="font-medium">Creative review</span> · {rev.qa.brief.score}/10
                  {rev.qa.brief.rounds > 1 ? ` after ${rev.qa.brief.rounds} rounds` : ""}
                  {rev.qa.brief.narration != null ? ` · narration ${rev.qa.brief.narration}/10 (advisory)` : ""}
                </p>
              </div>
              {rev.qa.brief.issues.length > 0 && (
                <ul className="text-xs text-muted list-disc pl-5 space-y-0.5">
                  {rev.qa.brief.issues.map((i, n) => <li key={n}>{i.problem}{i.fix ? ` — ${i.fix}` : ""}</li>)}
                </ul>
              )}
            </div>
          )}
          {rev.qa.media && rev.qa.media.status !== "skipped" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Pill tone={rev.qa.media.status === "passed" ? "success" : rev.qa.media.status === "failed" ? "danger" : "warning"}>
                  {rev.qa.media.status === "passed" ? "Passed" : rev.qa.media.status === "failed" ? "Failed" : "Not run"}
                </Pill>
                <p className="text-sm text-text"><span className="font-medium">Compared with the listing photos</span></p>
              </div>
              {rev.qa.media.blockers.length > 0 && (
                <ul className="text-xs text-danger list-disc pl-5 space-y-0.5">{rev.qa.media.blockers.map((b, n) => <li key={n}>{b}</li>)}</ul>
              )}
              {rev.qa.media.warnings.length > 0 && <p className="text-xs text-muted">{rev.qa.media.warnings.join("; ")}</p>}
            </div>
          )}
          {rev.qa.retryOf && <p className="text-xs text-muted">Re-rendered automatically after the previous version failed the photo comparison.</p>}
        </div>
      )}

      {rev?.mediaInfo && (
        <div className="space-y-2">
          <SectionTitle>{isBlog ? "Hero image" : "Media check"}</SectionTitle>
          <p className="text-sm text-text">{describeMedia(rev.mediaInfo)}</p>
          {rev.mediaInfo.checks ? (
            <div className="space-y-1.5">
              {Object.entries(rev.mediaInfo.checks).map(([platform, problems]) => (
                <div key={platform} className="flex items-start gap-2">
                  <Pill tone={problems.length ? "danger" : "success"}>{problems.length ? "Fails" : "Ready"}</Pill>
                  <p className="text-sm text-text"><span className="font-medium">{PLATFORM_LABEL[platform] ?? platform}</span>{problems.length ? <span className="text-danger"> — {problems.join("; ")}</span> : null}</p>
                </div>
              ))}
            </div>
          ) : null}
          {rev.mediaInfo.warnings.length > 0 && <p className="text-xs text-warning">{rev.mediaInfo.warnings.join("; ")}</p>}
        </div>
      )}

      {rev?.platformPosts && Object.keys(rev.platformPosts).length > 0 && (
        <div className="space-y-3">
          <SectionTitle>Post copy per platform</SectionTitle>
          {Object.entries(rev.platformPosts).map(([platform, post]) => (
            <div key={platform} className="rounded-lg border border-default p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{PLATFORM_LABEL[platform] ?? platform}{post.truncated ? " · shortened to fit" : ""}</p>
              <p className="text-sm text-text whitespace-pre-wrap">{post.text}</p>
              {post.hashtags.length > 0 && <p className="text-sm text-muted">{post.hashtags.map((h) => `#${h}`).join(" ")}</p>}
            </div>
          ))}
          <p className="text-xs text-muted">This is the exact text a future publisher would send. The same image or video is used on all three social platforms.</p>
        </div>
      )}

      {(decision?.reason || rev?.formatReason) && (
        <div className="space-y-3">
          <SectionTitle>Why the AI chose this</SectionTitle>
          {decision?.concept && <Field label={isBlog ? "Format" : "Concept"}><span className="font-normal">{decision.concept}</span></Field>}
          {decision?.theme && <Field label={isBlog ? "Angle" : "Theme"}><span className="font-normal">{decision.theme}</span></Field>}
          {decision?.reason && <Field label="Reasoning"><span className="font-normal">{decision.reason}</span></Field>}
          {rev?.formatReason && rev.formatReason !== decision?.reason && <Field label={isBlog ? "Why this format" : "Format"}><span className="font-normal">{rev.formatReason}</span></Field>}
          {isBlog && rev?.blog && rev.blog.observations.length > 0 && (
            <Field label="What the AI saw in the listing photos"><span className="font-normal">{rev.blog.observations.join(" · ")}</span></Field>
          )}
        </div>
      )}

      {decision?.strategy && (
        <div className="space-y-3">
          <SectionTitle>Creative strategy</SectionTitle>
          <Field label="Hook"><span className="font-normal">&ldquo;{decision.strategy.hookLine}&rdquo; · {humanize(decision.strategy.hookType)}</span></Field>
          <Field label="Pays off with"><span className="font-normal">{decision.strategy.payoff}</span></Field>
          <Field label="Who it's for"><span className="font-normal">{decision.strategy.persona} · {decision.strategy.eventType}</span></Field>
          <Field label="Angle"><span className="font-normal">{decision.strategy.angle}</span></Field>
          <Field label="Diagnosis">
            <span className="font-normal">
              Desire: {humanize(decision.strategy.desire)} · Awareness: {humanize(decision.strategy.awarenessLevel)} · Objective: {humanize(decision.strategy.objective)}
            </span>
          </Field>
          <Field label="Framework and levers">
            <span className="font-normal">{humanize(decision.strategy.framework)}{decision.strategy.levers.length > 0 ? ` · ${decision.strategy.levers.map(humanize).join(", ")}` : ""}</span>
          </Field>
          {(decision.strategy.peopleShots || decision.strategy.people) && (
            <Field label="People in the scene">
              <span className="font-normal">
                {decision.strategy.peopleShots
                  ? decision.strategy.peopleShots.withGuests === 0
                    ? "Clean shots only — no people"
                    : decision.strategy.peopleShots.withGuests === decision.strategy.peopleShots.total
                      ? "Background guests in every shot, no one speaks"
                      : `Background guests in ${decision.strategy.peopleShots.withGuests} of ${decision.strategy.peopleShots.total} shots, the rest are clean shots of the space`
                  : decision.strategy.people === "background_guests" ? "Background guests only, no one speaks" : "None"}
              </span>
            </Field>
          )}
          {decision.strategy.voice && (
            <Field label="Narrator's voice">
              <span className="font-normal">{humanize(decision.strategy.voice.mood)}{decision.strategy.voice.delivery ? ` · ${decision.strategy.voice.delivery}` : ""}</span>
            </Field>
          )}
          {decision.warnings?.map((w) => <p key={w} className="text-xs text-warning">{w}</p>)}
        </div>
      )}

      {revClips.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Clips</SectionTitle>
          <div className="border border-default rounded-lg overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Clip</TableHead><TableHead>Status</TableHead><TableHead>Length</TableHead><TableHead>Attempts</TableHead></TableRow></TableHeader>
              <TableBody>
                {revClips.map((c) => (
                  <TableRow key={c.index}>
                    <TableCell className="font-medium">Clip {c.index}</TableCell>
                    <TableCell><Pill tone={c.status === "completed" ? "success" : c.status === "failed" ? "danger" : "warning"}>{c.status}</Pill>{c.lastError && <p className="text-xs text-danger mt-1">{c.lastError}</p>}</TableCell>
                    <TableCell>{c.durationSeconds ? `${c.durationSeconds}s` : "—"}</TableCell>
                    <TableCell>{c.attempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {isBlog ? (
        <p className="text-xs text-muted">Blogs are display-only: they have no platform, schedule or posting time, and nothing is published. Use Copy Markdown to take the post elsewhere.</p>
      ) : (
        <div className="space-y-2">
          <SectionTitle>Proposed posting times</SectionTitle>
          {rev?.proposedSchedule?.length ? (
            <>
              <div className="border border-default rounded-lg overflow-hidden">
                <Table>
                  <TableHeader><TableRow><TableHead>Platform</TableHead><TableHead>When (local)</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rev.proposedSchedule.map((s) => (
                      <TableRow key={s.platform}>
                        <TableCell className="font-medium">{PLATFORM_LABEL[s.platform] ?? s.platform}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatSlot(s)}</TableCell>
                        <TableCell className="text-muted">{s.reason}{s.adjusted ? " (adjusted to fit the rules)" : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted">
                {rev.proposedSchedule.every((s) => s.source === "week_plan") ? "Chosen as part of the whole week's plan, spread across the weekly frequency. " : rev.proposedSchedule.every((s) => s.source === "per_creative") ? "Chosen for this creative on its own (no weekly plan was available). " : ""}
                Proposals only. In Testing mode nothing is scheduled or posted, and these are AI estimates — not guaranteed to be the best times.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No schedule proposed yet.</p>
          )}

        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={(o) => { if (!regenerate.isPending) setConfirmOpen(o); }}
        title="Regenerate this content?"
        description="A new revision is generated. The current version is kept and nothing is published."
        details={
          <div className="space-y-1.5">
            <label htmlFor="regen-guidance" className="text-sm font-medium text-text">Optional note for the AI</label>
            <Textarea id="regen-guidance" value={guidance} onChange={(e) => setGuidance(e.target.value)} maxLength={500} placeholder="e.g. Make it feel more like a team offsite" className="min-h-20" />
          </div>
        }
        confirmLabel="Regenerate"
        loading={regenerate.isPending}
        error={regenerate.error?.message}
        onConfirm={confirm}
      />
    </>
  );
}

export function ContentDetailDrawer({ contentId, title, onClose }: { contentId: string | null; title?: string; onClose: () => void }) {
  const { data, isLoading, error } = useContentDetail(contentId);
  return (
    <Drawer open={!!contentId} onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:sm:[--drawer-content-width:720px]">
        <DrawerHeader>
          <DrawerTitle>{data?.item.propertyTitle ?? title ?? "Content"}</DrawerTitle>
          <DrawerDescription>{data ? `${TYPE_LABEL[data.item.contentType]} · ${data.item.pipeline === "linkedin" ? "LinkedIn" : data.item.pipeline === "blog" ? "Display only" : "TikTok, Instagram, Facebook"}` : "Loading…"}</DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4"><Skeleton className="h-8 w-48 rounded" /><Skeleton className="w-full aspect-square rounded-lg" /><Skeleton className="h-24 w-full rounded-lg" /></div>
          ) : error ? (
            <p className="text-sm text-danger font-medium">{error.message}</p>
          ) : data ? (
            <Body key={data.item.id} detail={data} />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
