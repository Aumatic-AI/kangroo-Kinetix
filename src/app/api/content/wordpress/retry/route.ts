import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/services/inngest/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retry a failed (or held) Live blog's WordPress publication. `retry_blog_publication`
 * checks editor access, puts it back to pending and re-runs the "publishable now" checks
 * (Live mode, automation on, listing active, current valid revision), refusing if blocked.
 * Runs on the user's session; the publisher itself runs in Inngest.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.publicationId !== "string" || !UUID.test(body.publicationId)) {
      return NextResponse.json({ error: "Missing or invalid publicationId" }, { status: 400 });
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("retry_blog_publication", { p_id: body.publicationId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
    await inngest.send({ name: "content/blog-publish", data: { publicationId: body.publicationId } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[CONTENT_WORDPRESS_RETRY]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to retry" }, { status: 500 });
  }
}
