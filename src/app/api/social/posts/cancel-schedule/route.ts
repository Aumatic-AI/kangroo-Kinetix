import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { UploadPostService } from "@/services/upload-post";

/** Cancels a scheduled post — both on Upload-Post (which also deletes the
 * assets it staged for it) and locally, reverting the row back to draft
 * so it can be published or rescheduled again from the Posts grid.
 *
 * The row only goes back to draft once Upload-Post has confirmed the cancel.
 * If it can't (call failed, or no job id was recorded), the post would still go
 * out at its time, so it stays 'scheduled' and the caller gets an error — a draft
 * that's secretly still scheduled is how a post ends up published twice. */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!Array.isArray(body.socialPostIds) || !body.socialPostIds.length) {
      return NextResponse.json({ error: "Missing required field: socialPostIds" }, { status: 400 });
    }

    const { data: posts } = await supabase
      .from("social_posts")
      .select("id, status, upload_post_job_id, property_content_id")
      .in("id", body.socialPostIds);

    if (!posts || !posts.length) throw new Error("Posts not found");
    if (posts.some((p) => p.property_content_id !== null)) {
      return NextResponse.json({ error: "Automation posts are not scheduled on Upload-Post and cannot be cancelled here." }, { status: 409 });
    }

    const failed: string[] = [];        // NOT cancelled on Upload-Post — will still be posted
    const notRecorded: string[] = [];   // cancelled on Upload-Post, but this app still shows it scheduled
    for (const post of posts) {
      if (post.status !== "scheduled") continue;
      if (!post.upload_post_job_id) {
        failed.push("no Upload-Post job id was recorded for it, so it can't be cancelled from here — cancel it on the Upload-Post dashboard");
        continue;
      }
      try {
        await UploadPostService.cancelScheduledPost(post.upload_post_job_id);
      } catch (e) {
        console.error(`[SOCIAL_CANCEL_SCHEDULE_${post.id}]`, e);
        failed.push(`Upload-Post didn't confirm the cancel (${e instanceof Error ? e.message : String(e)})`);
        continue;
      }
      const { error } = await supabase
        .from("social_posts")
        .update({ status: "draft", scheduled_at: null, upload_post_job_id: null })
        .eq("id", post.id)
        .eq("status", "scheduled");
      if (error) {
        console.error(`[SOCIAL_CANCEL_SCHEDULE_${post.id}] cancelled on Upload-Post, local update failed`, error);
        notRecorded.push(error.message);
      }
    }

    if (failed.length) {
      return NextResponse.json({ error: `Not cancelled — it will still be posted at its time: ${[...new Set(failed)].join("; ")}.` }, { status: 502 });
    }
    if (notRecorded.length) {
      return NextResponse.json({ error: `Cancelled on Upload-Post, so it will NOT be posted — but it still shows as scheduled here because the update failed (${[...new Set(notRecorded)].join("; ")}). If cancelling again fails, confirm on the Upload-Post dashboard that it's no longer scheduled.` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_CANCEL_SCHEDULE]", error);
    return NextResponse.json({ error: error.message || "Failed to cancel scheduled post" }, { status: 500 });
  }
}
