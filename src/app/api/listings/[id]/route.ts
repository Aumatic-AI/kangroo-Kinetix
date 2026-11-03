import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { latestIso, parseStatus, rotationEligibility, toSummary } from "@/modules/listings/lib/listings";
import type {
  ImageValidation, ListingContentItem, ListingDetail, ListingEnvStats, ListingEnvironment, ListingPromotion, LocationVerified,
} from "@/modules/listings/types/listings.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

/** Everything about one listing: all images, full details, rotation status,
 * per-environment stats, and recent promotion / content history. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Invalid listing id" }, { status: 400 });
    const supabase = await createClient();

    const [prop, stats, promos, content] = await Promise.all([
      supabase
        .from("properties")
        .select("*, property_images(id, position, url, validation_status)")
        .eq("id", id)
        .order("position", { referencedTable: "property_images", ascending: true })
        .maybeSingle(),
      supabase.from("property_promotion_stats").select("*").eq("property_id", id),
      supabase
        .from("property_promotions")
        .select("id, environment, pipeline_type, status, claimed_at, generated_at, failure_reason")
        .eq("property_id", id)
        .order("claimed_at", { ascending: false })
        .limit(10),
      supabase
        .from("property_content")
        .select("id, environment, pipeline_type, content_type, generation_status, created_at, archived_at")
        .eq("property_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (prop.error) throw new Error(prop.error.message);
    if (!prop.data) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    for (const r of [stats, promos, content]) if (r.error) throw new Error(r.error.message);

    const p = prop.data;
    const images = (p.property_images ?? []).map((i) => ({
      id: i.id, position: i.position, url: i.url, validationStatus: i.validation_status as ImageValidation,
    }));
    const statEntries: ListingEnvStats[] = (stats.data ?? []).map((s) => ({
      environment: s.environment as ListingEnvironment,
      generatedCount: s.generated_count ?? 0,
      socialGeneratedCount: s.social_generated_count ?? 0,
      linkedinGeneratedCount: s.linkedin_generated_count ?? 0,
      failedGenerationCount: s.failed_generation_count ?? 0,
      inFlightCount: s.in_flight_count ?? 0,
      contentCount: s.content_count ?? 0,
      publishedContentCount: s.published_content_count ?? 0,
      lastGeneratedAt: s.last_generated_at,
      lastPublishedAt: s.last_published_at,
    }));
    const promotions: ListingPromotion[] = (promos.data ?? []).map((r) => ({
      id: r.id,
      environment: r.environment as ListingEnvironment,
      pipelineType: r.pipeline_type as ListingPromotion["pipelineType"],
      status: r.status as ListingPromotion["status"],
      claimedAt: r.claimed_at,
      generatedAt: r.generated_at,
      failureReason: r.failure_reason,
    }));
    const contentItems: ListingContentItem[] = (content.data ?? []).map((r) => ({
      id: r.id,
      environment: r.environment as ListingEnvironment,
      pipelineType: r.pipeline_type as ListingContentItem["pipelineType"],
      contentType: r.content_type as ListingContentItem["contentType"],
      generationStatus: r.generation_status as ListingContentItem["generationStatus"],
      createdAt: r.created_at,
      archived: r.archived_at !== null,
    }));

    const summary = toSummary(
      { ...p, property_images: images.filter((i) => i.validationStatus !== "broken") },
      latestIso(...statEntries.map((s) => s.lastGeneratedAt)),
    );
    const detail: ListingDetail = {
      ...summary,
      eventTypes: p.event_types ?? [],
      locationRaw: p.location_raw,
      region: p.region,
      country: p.country,
      timezone: p.timezone,
      locationVerified: p.location_verified as LocationVerified,
      rotationSeq: Number(p.rotation_seq),
      images,
      eligibility: rotationEligibility(summary.status, images),
      stats: statEntries,
      promotions,
      content: contentItems,
    };
    return NextResponse.json(detail);
  } catch (error: unknown) {
    console.error("[LISTING_DETAIL]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load listing" }, { status: 500 });
  }
}

/** Activate / deactivate. Runs on the user's session: RLS lets only editors and
 * above update properties, and an update RLS filters out touches zero rows. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Invalid listing id" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const status = parseStatus(body?.status);
    if (!status) return NextResponse.json({ error: "status must be 'active' or 'inactive'" }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase.from("properties").update({ status }).eq("id", id).select("id, status").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Listing not found, or you don't have permission to change it" }, { status: 403 });
    return NextResponse.json({ success: true, id: data.id, status: data.status });
  } catch (error: unknown) {
    console.error("[LISTING_STATUS]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update listing" }, { status: 500 });
  }
}
