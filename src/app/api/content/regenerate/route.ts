import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/services/inngest/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gallery "Regenerate": creates a NEW pending revision of a creative.
 *
 * Runs on the signed-in user's cookie client — NOT the service role. The
 * `request_content_regeneration` function authorizes the caller itself
 * (editor+ in the content's business) and refuses Live content that already has
 * publishing records. It never moves the current-revision pointer and never
 * creates a publishing record; the new revision stays unpublishable until the
 * generation job validates it. No service-role key is involved or exposed.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    if (typeof body.contentId !== "string" || !UUID.test(body.contentId)) {
      return NextResponse.json({ error: "Missing or invalid contentId" }, { status: 400 });
    }

    const { data: revisionId, error } = await supabase.rpc("request_content_regeneration", {
      p_content: body.contentId,
      p_prompt: typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : undefined,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }

    await inngest.send({
      name: "content/regenerate-requested",
      data: { contentId: body.contentId, revisionId },
    });
    return NextResponse.json({ success: true, revisionId });
  } catch (error: unknown) {
    console.error("[CONTENT_REGENERATE]", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : null) || "Failed to regenerate" }, { status: 500 });
  }
}
