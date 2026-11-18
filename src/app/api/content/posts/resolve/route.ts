import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an automation post whose publish outcome is unknown (the request may or
 * may not have reached the platform, and Upload-Post has no id to check). An
 * editor looks at the platform and confirms "published" or "failed".
 * `confirm_unknown_publish` checks editor access and that the post really is
 * unresolved. A post marked failed can then be retried; one never auto-retries.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.socialPostId !== "string" || !UUID.test(body.socialPostId)) {
      return NextResponse.json({ error: "Missing or invalid socialPostId" }, { status: 400 });
    }
    if (body.outcome !== "published" && body.outcome !== "failed") {
      return NextResponse.json({ error: "outcome must be \"published\" or \"failed\"" }, { status: 400 });
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("confirm_unknown_publish", { p_post: body.socialPostId, p_outcome: body.outcome });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
    return NextResponse.json({ success: true, status: data });
  } catch (error: unknown) {
    console.error("[CONTENT_RESOLVE_PUBLISH]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to resolve" }, { status: 500 });
  }
}
