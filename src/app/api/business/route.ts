import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

// Basic business info only — name/branding, not the deeper AI-facing config
// (guidelines, settings, etc.), which is only needed on the settings pages
// themselves.
export async function GET() {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;

    const { data: business, error } = await supabase
      .from("businesses")
      .select("id, name, website_url, logo_asset_id, industry, services, outreach_settings")
      .limit(1)
      .single();

    if (error || !business) {
      return NextResponse.json({ error: "No business found" }, { status: 404 });
    }

    return NextResponse.json({ business });
  } catch (error: any) {
    console.error("[BUSINESS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch business" }, { status: 500 });
  }
}
