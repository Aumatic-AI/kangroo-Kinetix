import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { UploadPostService } from "@/services/upload-post";

/** Cancels a scheduled post — both on Upload-Post (which also deletes the
 * assets it staged for it) and locally, reverting the row back to draft
 * so it can be published or rescheduled again from the Posts grid. */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!Array.isArray(body.socialPostIds) || !body.socialPostIds.length) {
      return NextResponse.json({ error: "Missing required field: socialPostIds" }, { status: 400 });
    }

    const { data: posts } = await supabase
      .from("social_posts")
      .select("id, status, upload_post_job_id")
      .in("id", body.socialPostIds);

    if (!posts || !posts.length) throw new Error("Posts not found");

    for (const post of posts) {
      if (post.status !== "scheduled") continue;
      if (post.upload_post_job_id) {
        try {
          await UploadPostService.cancelScheduledPost(post.upload_post_job_id);
        } catch (e) {
          console.error(`[SOCIAL_CANCEL_SCHEDULE_${post.id}]`, e);
        }
      }
      await supabase
        .from("social_posts")
        .update({ status: "draft", scheduled_at: null, upload_post_job_id: null })
        .eq("id", post.id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_CANCEL_SCHEDULE]", error);
    return NextResponse.json({ error: error.message || "Failed to cancel scheduled post" }, { status: 500 });
  }
}
