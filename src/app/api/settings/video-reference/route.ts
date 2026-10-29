import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

/**
 * Uploads the male or female character reference photo used to condition
 * AI video generation (Meta Ads video ads + Social Media video posts) —
 * see businesses.video_reference_{enabled,male_url,female_url}. Image
 * generation never uses this; video-only, per the product decision.
 * Stored in the same `business_media` bucket every other upload uses.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const gender = formData.get("gender") as string | null;

    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (gender !== "male" && gender !== "female") return NextResponse.json({ error: "gender must be 'male' or 'female'" }, { status: 400 });

    const { data: business } = await supabase.from("businesses").select("id").limit(1).single();
    if (!business) return NextResponse.json({ error: "No business found" }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${business.id}/settings/video-reference/${gender}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;

    const { error: uploadError } = await supabase.storage.from("business_media").upload(fileName, buffer, { contentType: file.type });
    if (uploadError) throw new Error("Upload failed: " + uploadError.message);
    const { data: publicUrlData } = supabase.storage.from("business_media").getPublicUrl(fileName);

    const updatePayload = gender === "male" ? { video_reference_male_url: publicUrlData.publicUrl } : { video_reference_female_url: publicUrlData.publicUrl };
    const { error: updateError } = await supabase.from("businesses").update(updatePayload).eq("id", business.id);
    if (updateError) throw new Error("Failed to save reference photo: " + updateError.message);

    return NextResponse.json({ success: true, url: publicUrlData.publicUrl });
  } catch (error: any) {
    console.error("[SETTINGS_VIDEO_REFERENCE_UPLOAD]", error);
    return NextResponse.json({ error: error.message || "Failed to upload reference photo" }, { status: 500 });
  }
}
