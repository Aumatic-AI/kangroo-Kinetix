import { NextResponse } from "next/server";
import { requireMetaAdAccountEnv, graphGet } from "@/services/meta/graph-client";

interface RawLocation {
  key: string;
  name: string;
  type: string;
  country_code?: string;
  country_name?: string;
  region?: string;
}

/**
 * Proxies Meta's own geolocation search (`/search?type=adgeolocation`) —
 * the exact database Meta's own targeting uses, so anything picked here is
 * guaranteed to be a valid targeting key. Deliberately not a third-party
 * country-list library: those only cover countries, not the cities/regions
 * Meta's targeting.geo_locations also accepts (see launch.service.ts's
 * buildTargeting), and a plain city/country NAME isn't valid Meta targeting
 * data on its own — Meta requires its own internal `key` per location.
 * Ported from the legacy project's /api/meta/locations route.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ locations: [] });

    const { accessToken } = requireMetaAdAccountEnv();
    const data = await graphGet<{ data?: RawLocation[] }>("search", accessToken, {
      type: "adgeolocation",
      q,
      locale: "en_US",
      limit: "25",
    });

    const locations = (data.data || [])
      .filter((loc) => loc.type === "country" || loc.type === "region" || loc.type === "city")
      .map((loc) => ({
        key: loc.key,
        name: loc.name,
        type: loc.type as "country" | "region" | "city",
        countryCode: loc.country_code,
      }));

    return NextResponse.json({ locations });
  } catch (error: any) {
    console.error("[META_ADS_LOCATIONS]", error);
    return NextResponse.json({ error: error.message || "Failed to search locations" }, { status: 500 });
  }
}
