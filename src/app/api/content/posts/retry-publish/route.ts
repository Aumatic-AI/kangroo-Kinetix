import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retry a FAILED automation post. `retry_failed_publish` re-runs the same
 * eligibility checks as the publishing worker (Live mode, automation enabled,
 * property active, current + valid revision, healthy connection), refuses
 * posts whose outcome is unknown, and only re-queues — the worker publishes.
 * Runs on the user's session; the function checks editor+ membership itself.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    if (typeof body.socialPostId !== "string" || !UUID.test(body.socialPostId)) {
      return NextResponse.json({ error: "Missing or invalid socialPostId" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("retry_failed_publish", { p_post: body.socialPostId });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
    }
    return NextResponse.json({ success: true, status: data });
  } catch (error: unknown) {
    console.error("[CONTENT_RETRY_PUBLISH]", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : null) || "Failed to retry" }, { status: 500 });
  }
}
