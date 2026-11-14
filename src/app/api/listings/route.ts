import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paginationMeta, rangeFor } from "@/lib/pagination";
import { latestIso, parseNewListing, parsePaging, parseStatus, searchOrFilter, toSummary } from "@/modules/listings/lib/listings";
import type { ListingsResponse } from "@/modules/listings/types/listings.types";

/**
 * Listings table: one page of properties with just enough to scan (thumbnail,
 * title, city, category, status, last promoted). Runs on the signed-in user's
 * session, so RLS scopes it to their business — no business id is passed.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = request.nextUrl;
    const { page, limit } = parsePaging(searchParams.get("page"), searchParams.get("limit"));
    const status = parseStatus(searchParams.get("status"));
    const category = searchParams.get("category")?.trim() || undefined;
    const orFilter = searchOrFilter(searchParams.get("search"));
    const [from, to] = rangeFor(page, limit);

    let query = supabase
      .from("properties")
      // First usable reference image only — the embedded filter/limit apply to
      // the images, never to which properties come back.
      .select("id, title, city, space_category, status, property_images(url, position)", { count: "exact" })
      .neq("property_images.validation_status", "broken")
      .order("position", { referencedTable: "property_images", ascending: true })
      .limit(1, { referencedTable: "property_images" })
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("space_category", category);
    if (orFilter) query = query.or(orFilter);

    const [list, categoriesRes, activeRes, inactiveRes] = await Promise.all([
      query,
      supabase.from("properties").select("space_category").not("space_category", "is", null),
      supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", "inactive"),
    ]);
    if (list.error) throw new Error(list.error.message);

    const rows = list.data ?? [];
    const lastPromoted = new Map<string, string | null>();
    if (rows.length) {
      const { data: stats, error } = await supabase
        .from("property_promotion_stats")
        .select("property_id, last_generated_at")
        .in("property_id", rows.map((r) => r.id));
      if (error) throw new Error(error.message);
      for (const s of stats ?? []) {
        if (s.property_id) lastPromoted.set(s.property_id, latestIso(lastPromoted.get(s.property_id), s.last_generated_at));
      }
    }

    const categories = [...new Set((categoriesRes.data ?? []).map((r) => r.space_category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
    const body: ListingsResponse = {
      listings: rows.map((r) => toSummary(r, lastPromoted.get(r.id) ?? null)),
      pagination: paginationMeta(list.count ?? 0, page, limit),
      categories,
      counts: { active: activeRes.count ?? 0, inactive: inactiveRes.count ?? 0 },
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    console.error("[LISTINGS_LIST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load listings" }, { status: 500 });
  }
}

/**
 * Add a listing by hand (the bulk of the inventory still comes from the import).
 * Photos are uploaded by the browser straight to business_media first, so only
 * their URLs arrive here. RLS lets only editors and above insert. New listings
 * join the rotation at the end (rotation_seq is assigned by the database).
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = parseNewListing(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const supabase = await createClient();
    const { data: business, error: bizError } = await supabase.from("businesses").select("id").limit(1).single();
    if (bizError || !business) throw new Error("No business found");

    const { data: property, error } = await supabase
      .from("properties")
      .insert({
        business_id: business.id,
        source_key: `manual:${crypto.randomUUID()}`,
        import_batch: "manual",
        title: input.title,
        space_category: input.spaceCategory,
        event_types: input.eventTypes,
        city: input.city,
        location_raw: input.city,
      })
      .select("id, title")
      .single();
    if (error || !property) {
      const denied = error?.code === "42501";
      return NextResponse.json(
        { error: denied ? "You don't have permission to add listings" : error?.message || "Failed to create listing" },
        { status: denied ? 403 : 500 },
      );
    }

    const { error: imgError } = await supabase.from("property_images").insert(
      input.imageUrls.map((url, i) => ({ business_id: business.id, property_id: property.id, position: i + 1, url })),
    );
    if (imgError) {
      // Don't leave a listing without its photos behind.
      await supabase.from("properties").delete().eq("id", property.id);
      throw new Error(`Failed to save photos: ${imgError.message}`);
    }

    return NextResponse.json({ success: true, id: property.id, title: property.title }, { status: 201 });
  } catch (error: unknown) {
    console.error("[LISTINGS_CREATE]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create listing" }, { status: 500 });
  }
}
