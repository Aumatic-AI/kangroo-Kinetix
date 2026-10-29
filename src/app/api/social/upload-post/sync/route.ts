import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { env } from "@/config/env";
import { UploadPostService, isAccountConnected, SUPPORTED_UPLOAD_POST_PLATFORMS, buildProfileUrl } from "@/services/upload-post";

/**
 * Pulls the live connection state from Upload-Post and mirrors it into
 * `platform_connections` (account_kind='upload_post') so the rest of the
 * app — Posts, the Publish flow page, etc. — can keep reading from that one
 * table exactly as before. This does NOT connect/disconnect anything;
 * accounts are connected on the Upload-Post dashboard. It just reflects
 * that state locally and resolves the Facebook Page id needed to publish.
 */
export async function POST() {
  try {
    const username = env.UPLOAD_POST_PROFILE;
    if (!username) {
      return NextResponse.json({ error: "UPLOAD_POST_PROFILE is not configured" }, { status: 400 });
    }

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const { data: business } = await supabase.from("businesses").select("id").limit(1).single();
    if (!business) throw new Error("No business found");

    const profile = await UploadPostService.getProfile(username);

    // Upload-Post's profile summary reports the *logged-in identity* for
    // Facebook/LinkedIn (a personal account/profile, shown under the person's
    // own name), not the Page we actually post as. We always post to
    // a Page (facebook_page_id / target_linkedin_page_id), so the name and
    // picture shown here should be the Page's, not the login's — otherwise
    // Connected Accounts shows a name nobody posting recognizes as "where
    // this actually goes."
    let facebookPage: { id: string; name: string; picture?: string } | undefined;
    if (isAccountConnected(profile.social_accounts.facebook)) {
      try {
        const pages = await UploadPostService.getFacebookPages(username);
        facebookPage = pages[0];
      } catch (e) {
        console.error("[UPLOAD_POST_SYNC] Failed to resolve Facebook page", e);
      }
    }

    let linkedinPage: { id: string; name: string; picture?: string } | undefined;
    if (isAccountConnected(profile.social_accounts.linkedin)) {
      try {
        const pages = await UploadPostService.getLinkedInPages(username);
        linkedinPage = pages[0];
      } catch (e) {
        console.error("[UPLOAD_POST_SYNC] Failed to resolve LinkedIn page", e);
      }
    }

    const rows: Database["public"]["Tables"]["platform_connections"]["Insert"][] = SUPPORTED_UPLOAD_POST_PLATFORMS.map((platform) => {
      const account = profile.social_accounts[platform];
      const connected = isAccountConnected(account);
      const page = platform === "facebook" ? facebookPage : platform === "linkedin" ? linkedinPage : undefined;

      return {
        business_id: business.id,
        platform,
        account_kind: "upload_post",
        external_id: username,
        display_name: connected ? page?.name?.trim() || account.display_name || account.username || platform : null,
        status: connected ? "connected" : "revoked",
        metadata: {
          source: "upload_post",
          avatarUrl: connected ? page?.picture || account.social_images : undefined,
          username: connected ? account.username : undefined,
          profileUrl: connected ? buildProfileUrl(platform, account, page) : undefined,
          ...(platform === "facebook" && facebookPage ? { facebookPageId: facebookPage.id } : {}),
          ...(platform === "linkedin" && linkedinPage ? { linkedinPageId: linkedinPage.id } : {}),
        },
      };
    });

    const { data: upserted, error } = await supabase
      .from("platform_connections")
      .upsert(rows, { onConflict: "business_id,platform,account_kind,external_id" })
      .select("id, platform, display_name, status, metadata, created_at");
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, connections: upserted });
  } catch (error: any) {
    console.error("[UPLOAD_POST_SYNC]", error);
    return NextResponse.json({ error: error.message || "Failed to sync Upload-Post connections" }, { status: 500 });
  }
}
