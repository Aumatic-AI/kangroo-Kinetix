import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paginationMeta, rangeFor } from "@/lib/pagination";
import { parsePaging } from "@/modules/listings/lib/listings";
import { loadMedia } from "@/modules/content/lib/media";
import { toItem, toRevision, type ContentRow, type RevisionRow } from "@/modules/content/lib/mappers";
import type { GalleryResponse } from "@/modules/content/types/content.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oneOf = <T extends string>(v: string | null, allowed: readonly T[]): T | undefined => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : undefined;

/**
 * Gallery list: generated creatives, newest first. Runs on the signed-in
 * user's session (RLS scopes to their business). Read-only — nothing here can
 * publish; Testing content simply has no social_posts rows to show.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const sp = request.nextUrl.searchParams;
    const { page, limit } = parsePaging(sp.get("page"), sp.get("limit"), 48);
    const [from, to] = rangeFor(page, limit);

    let q = supabase.from("property_content")
      .select("id, property_id, pipeline_type, content_type, environment, generation_status, created_at, current_revision_id", { count: "exact" })
      .is("archived_at", null).order("created_at", { ascending: false }).order("id").range(from, to);
    const type = oneOf(sp.get("type"), ["video", "image", "text_image", "blog"] as const);
    const pipeline = oneOf(sp.get("pipeline"), ["social", "linkedin", "blog"] as const);
    const status = oneOf(sp.get("status"), ["pending", "processing", "completed", "failed"] as const);
    const environment = oneOf(sp.get("environment"), ["testing", "live"] as const);
    const property = sp.get("property");
    const since = sp.get("from"); const until = sp.get("to");
    if (type) q = q.eq("content_type", type);
    if (pipeline) q = q.eq("pipeline_type", pipeline);
    if (status) q = q.eq("generation_status", status);
    if (environment) q = q.eq("environment", environment);
    if (property && UUID.test(property)) q = q.eq("property_id", property);
    if (since && !Number.isNaN(Date.parse(since))) q = q.gte("created_at", new Date(since).toISOString());
    if (until && !Number.isNaN(Date.parse(until))) q = q.lt("created_at", new Date(new Date(until).getTime() + 86_400_000).toISOString());

    const list = await q;
    if (list.error) throw new Error(list.error.message);
    const rows = (list.data ?? []) as ContentRow[];

    const ids = rows.map((r) => r.id);
    const [revRes, propRes] = ids.length
      ? await Promise.all([
          supabase.from("content_revisions")
            .select("id, property_content_id, revision_number, caption, hashtags, script, video_format, video_duration, format_reason, validation_status, validation_errors, media_asset_id, proposed_schedule, generation_prompt, created_at")
            .in("property_content_id", ids).order("revision_number", { ascending: false }),
          supabase.from("properties").select("id, title, city").in("id", [...new Set(rows.map((r) => r.property_id))]),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (revRes.error) throw new Error(revRes.error.message);
    if (propRes.error) throw new Error(propRes.error.message);

    const revRows = (revRes.data ?? []) as RevisionRow[];
    const media = await loadMedia(supabase, revRows.map((r) => r.media_asset_id));
    const props = new Map((propRes.data ?? []).map((p) => [p.id, p]));

    const body: GalleryResponse = {
      items: rows.map((c) => toItem(c, revRows.filter((r) => r.property_content_id === c.id).map((r) => toRevision(r, media)), props.get(c.property_id))),
      pagination: paginationMeta(list.count ?? 0, page, limit),
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    console.error("[CONTENT_GALLERY]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load the gallery" }, { status: 500 });
  }
}
