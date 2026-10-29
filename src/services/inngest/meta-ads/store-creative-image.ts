/**
 * Downloads a finished Kie-generated image and re-uploads it into our own
 * `business_media` bucket, so a Meta Ads / AI Ad Studio creative's image is
 * durable and ours rather than depending on Kie's own (temporary) result
 * URL — the image-side counterpart to `downloadAndStoreVideo` in
 * `../../ffmpeg/stitch-scenes.ts`, which already does this for video ads.
 * Only applies going forward: existing creatives already pointing at a Kie
 * URL are left as they are. `supabase` is whatever service-role client the
 * calling job already created.
 */
export async function downloadAndStoreImage(supabase: any, businessId: string, sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to download generated image: ${response.status}`);
  const buffer = await response.arrayBuffer();

  const storagePath = `${businessId}/meta-ads/images/${Date.now()}.png`;
  const { error } = await supabase.storage.from("business_media").upload(storagePath, buffer, { contentType: "image/png" });
  if (error) throw new Error("Image upload to Supabase failed: " + error.message);

  const { data } = supabase.storage.from("business_media").getPublicUrl(storagePath);
  return data.publicUrl;
}
