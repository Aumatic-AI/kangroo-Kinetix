import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMedia } from "@/modules/content/lib/media";
import { toItem, toRevision, type ContentRow, type RevisionRow } from "@/modules/content/lib/mappers";
import type { ClipSummary, ContentDetail, CreativeStrategySummary } from "@/modules/content/types/content.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredStrategy {
  event_type?: string; persona?: string; desire?: string; awareness_level?: string; objective?: string; angle?: string;
  framework?: string; levers?: string[]; hook?: { hook_type?: string; line?: string }; payoff?: string;
}
interface StoredDecision {
  plan?: { data?: { reason?: string; concept?: string; theme?: string; angle?: string; format?: string; people?: string; strategy?: StoredStrategy; video?: { shot?: { beats?: { people?: string }[]; voice?: { mood?: string; delivery?: string } } } | null } };
  warnings?: string[];
}

function toStrategy(d: NonNullable<NonNullable<StoredDecision["plan"]>["data"]>): CreativeStrategySummary | undefined {
  const s = d.strategy;
  if (!s?.hook?.line) return undefined;
  return {
    eventType: s.event_type ?? "", persona: s.persona ?? "", desire: s.desire ?? "", awarenessLevel: s.awareness_level ?? "",
    objective: s.objective ?? "", angle: s.angle ?? "", framework: s.framework ?? "", levers: s.levers ?? [],
    hookType: s.hook.hook_type ?? "", hookLine: s.hook.line, payoff: s.payoff ?? "", people: d.people ?? null,
    peopleShots: d.video?.shot?.beats?.length
      ? { withGuests: d.video.shot.beats.filter((b) => b.people === "background_guests").length, total: d.video.shot.beats.length }
      : null,
    voice: d.video?.shot?.voice?.mood ? { mood: d.video.shot.voice.mood, delivery: d.video.shot.voice.delivery ?? "" } : null,
  };
}

/** One creative with every revision, its clips, and the AI's stated reasoning. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const supabase = await createClient();

    const { data: content, error } = await supabase.from("property_content")
      .select("id, property_id, pipeline_type, content_type, environment, generation_status, created_at, current_revision_id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!content) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [revRes, clipRes, propRes] = await Promise.all([
      supabase.from("content_revisions")
        .select("id, property_content_id, revision_number, caption, hashtags, script, video_format, video_duration, format_reason, validation_status, validation_errors, media_asset_id, proposed_schedule, generation_prompt, created_at, content_decision")
        .eq("property_content_id", id).order("revision_number", { ascending: false }),
      supabase.from("content_clips").select("revision_id, clip_index, status, duration_seconds, media_asset_id, last_error, attempts").eq("property_content_id", id).order("clip_index"),
      supabase.from("properties").select("id, title, city").eq("id", content.property_id).maybeSingle(),
    ]);
    if (revRes.error) throw new Error(revRes.error.message);
    if (clipRes.error) throw new Error(clipRes.error.message);

    const revRows = (revRes.data ?? []) as (RevisionRow & { content_decision?: StoredDecision | null })[];
    const media = await loadMedia(supabase, [...revRows.map((r) => r.media_asset_id), ...(clipRes.data ?? []).map((c) => c.media_asset_id)]);
    const revisions = revRows.map((r) => toRevision(r, media));

    const clips: Record<string, ClipSummary[]> = {};
    for (const c of clipRes.data ?? []) {
      (clips[c.revision_id] ??= []).push({
        index: c.clip_index, status: c.status, durationSeconds: c.duration_seconds == null ? null : Number(c.duration_seconds),
        mediaUrl: c.media_asset_id ? media.get(c.media_asset_id)?.url ?? null : null, lastError: c.last_error, attempts: c.attempts,
      });
    }

    const currentRow = revRows.find((r) => r.id === content.current_revision_id) ?? revRows[0];
    const d = currentRow?.content_decision?.plan?.data;
    const body: ContentDetail = {
      item: toItem(content as ContentRow, revisions, propRes.data ?? undefined),
      revisions, clips,
      decision: d ? {
        reason: d.reason, concept: d.concept ?? d.format, theme: d.theme ?? d.angle,
        strategy: toStrategy(d), warnings: currentRow?.content_decision?.warnings,
      } : null,
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    console.error("[CONTENT_DETAIL]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load content" }, { status: 500 });
  }
}

/**
 * Deletes one gallery item with its revisions and clips (they cascade). The content
 * tables aren't writable from a user session, so this goes through the
 * `delete_content_item` function, which checks editor access, refuses an item that
 * is still generating, and refuses one that something still references.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const supabase = await createClient();

    const { error } = await supabase.rpc("delete_content_item", { p_id: id });
    if (error) {
      const map: Record<string, [number, string]> = {
        "42501": [403, "You don't have permission to delete this item."],
        P0002: [404, "Not found"],
        "55006": [409, "This item is still generating. Wait for it to finish or fail, then delete it."],
        "23503": [409, "This item is referenced by a post and can't be deleted."],
      };
      const [status, message] = map[error.code] ?? [500, error.message];
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[CONTENT_DELETE]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete" }, { status: 500 });
  }
}
