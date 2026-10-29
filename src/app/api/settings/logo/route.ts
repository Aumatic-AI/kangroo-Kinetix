import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

/**
 * Uploads the business logo used on AI Ad Studio poster-style ads —
 * see businesses.logo_url. Same upload-on-pick pattern as the video
 * reference photos, stored in the same business_media bucket.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    const { data: business } = await supabase.from("businesses").select("id").limit(1).single();
    if (!business) return NextResponse.json({ error: "No business found" }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${business.id}/settings/logo/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;

    const { error: uploadError } = await supabase.storage.from("business_media").upload(fileName, buffer, { contentType: file.type });
    if (uploadError) throw new Error("Upload failed: " + uploadError.message);
    const { data: publicUrlData } = supabase.storage.from("business_media").getPublicUrl(fileName);

    const { error: updateError } = await supabase.from("businesses").update({ logo_url: publicUrlData.publicUrl }).eq("id", business.id);
    if (updateError) throw new Error("Failed to save logo: " + updateError.message);

    return NextResponse.json({ success: true, url: publicUrlData.publicUrl });
  } catch (error: any) {
    console.error("[SETTINGS_LOGO_UPLOAD]", error);
    return NextResponse.json({ error: error.message || "Failed to upload logo" }, { status: 500 });
  }
}
