import { inngest } from "../client";
import { env } from "@/config/env";
import { supabase, rpc, type Step } from "./shared";
import { WordPressService, WordPressError } from "@/services/wordpress";
import {
  blogToWordPressHtml, classifyWordPressFailure, findOwnPost, type WordPressImage,
} from "@/services/content-automation/blog-wordpress";
import type { BlogBlock } from "@/services/content-automation/blog";

/**
 * Publishes one Live blog to WordPress (blog_publications row → a published post).
 *
 * Only Live content ever has a blog_publications row (DB CHECK + trigger), so during
 * the testing phase this never runs and blogs stay in the gallery. A row waits for its
 * scheduled_at (the blog's AI-chosen publish time): an early event finds it 'not_due'
 * and re-sends itself for that time. Every step that
 * talks to WordPress returns an outcome instead of throwing, so a definite rejection
 * vs. a "try again later" failure survives Inngest's step serialisation.
 *
 * Idempotency: each uploaded image is saved on the row (wp_media) as soon as it is
 * uploaded, and before creating the post the worker searches for a post it already
 * created (exact title, newer than the row) and adopts it.
 */

interface StoredImage { id: string; role: "hero" | "inline"; alt: string; caption: string; url: string | null }
interface StoredBlog { title: string; slug: string; meta_description: string; tags: string[]; blocks: BlogBlock[]; images: StoredImage[] }
type Media = Record<string, { id: number; url: string }>;
type Outcome<T> = { ok: true; value: T } | { ok: false; outcome: "retry" | "failed"; error: string };

async function attempt<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const status = e instanceof WordPressError ? e.status : null;
    return { ok: false, outcome: classifyWordPressFailure(status), error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
  }
}

export const publishBlogToWordPress = inngest.createFunction(
  { id: "content-blog-publish", triggers: [{ event: "content/blog-publish" }], concurrency: { limit: 1 }, retries: 2 },
  async ({ event, step }) => {
    const { publicationId } = event.data as { publicationId: string };
    const worker = `inngest-${event.id ?? publicationId}`;

    const claim = await step.run("claim", () => rpc<string>("claim_blog_publication", { p_id: publicationId, p_worker: worker }));
    if (claim === "not_due") {
      const due = await step.run("due-at", async () => {
        const { data } = await supabase.from("blog_publications").select("next_attempt_at").eq("id", publicationId).single();
        return data?.next_attempt_at ?? null;
      });
      if (due) await step.sendEvent("wait-until-due", { name: "content/blog-publish", data: { publicationId }, ts: Date.parse(due) });
      return { status: "not_due" };
    }
    if (claim !== "claimed") return { status: claim };

    const finish = (id: string, outcome: "published" | "retry" | "failed" | "blocked", extra: { postId?: number; url?: string; error?: string } = {}) =>
      step.run(id, () => rpc<string>("finish_blog_publication", {
        p_id: publicationId, p_worker: worker, p_outcome: outcome,
        p_wp_post_id: extra.postId ?? null, p_wp_url: extra.url ?? null, p_error: extra.error ?? null,
      }));

    const fail = async (o: { outcome: "retry" | "failed"; error: string }) => {
      const status = await finish("finish-failed", o.outcome, { error: o.error });
      if (status === "pending") {
        const due = await step.run("retry-at", async () => {
          const { data } = await supabase.from("blog_publications").select("next_attempt_at").eq("id", publicationId).single();
          return data?.next_attempt_at ?? new Date(Date.now() + 5 * 60_000).toISOString();
        });
        await step.sendEvent("retry-later", { name: "content/blog-publish", data: { publicationId }, ts: Date.parse(due) });
      }
      return { status, error: o.error };
    };

    try {
      return await publish();
    } catch (e) {
      // Something unexpected (e.g. the database) failed after Inngest's own retries. Hand the
      // row back as a retry instead of leaving it 'publishing' until its lease runs out.
      return fail({ outcome: "retry", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
    }

    async function publish() {
    const ctx = await step.run("load", async () => {
      const { data: pub } = await supabase.from("blog_publications")
        .select("content_revision_id, wp_media, wp_post_id, wp_url, created_at").eq("id", publicationId).single();
      if (!pub) throw new Error("publication disappeared");
      const { data: rev } = await supabase.from("content_revisions").select("content_decision").eq("id", pub.content_revision_id).single();
      const blog = ((rev?.content_decision ?? {}) as { blog?: StoredBlog }).blog ?? null;
      return { blog, media: (pub.wp_media ?? {}) as Media, postId: pub.wp_post_id as number | null, url: pub.wp_url as string | null, createdAt: pub.created_at as string };
    });
    if (!ctx.blog) return fail({ outcome: "failed", error: "the revision has no blog content" });
    const blog = ctx.blog;

    // A post id saved by an earlier attempt means the post exists: just finish.
    if (ctx.postId) return { status: await finish("finish-recorded", "published", { postId: ctx.postId, url: ctx.url ?? undefined }) };

    // ---- 1. images → media library (one step each, saved as they finish) ----------------
    const media: Media = { ...ctx.media };
    for (const [idx, img] of blog.images.entries()) {
      if (media[img.id] || !img.url) continue;
      const r = (await step.run(`upload-image-${idx}`, async () => {
        const res = await attempt(() => WordPressService.uploadImageFromUrl({
          sourceUrl: img.url!, filename: `${blog.slug}-${idx + 1}.jpg`, alt: img.alt, caption: img.caption,
        }));
        if (res.ok) {
          const { data: row } = await supabase.from("blog_publications").select("wp_media").eq("id", publicationId).single();
          await supabase.from("blog_publications")
            .update({ wp_media: { ...((row?.wp_media ?? {}) as Media), [img.id]: res.value } })
            .eq("id", publicationId).eq("locked_by", worker);
        }
        return res;
      })) as Outcome<{ id: number; url: string }>;
      if (!r.ok) return fail(r);
      media[img.id] = r.value;
    }

    // ---- 2. re-check, then create the post (or adopt one a lost response created) -------
    const created = (await step.run("create-post", async () => {
      const reason = await rpc<string | null>("blog_publish_block_reason", { p_id: publicationId, p_expect_status: "publishing" });
      if (reason) return { ok: true, value: { blocked: reason } } as const;

      const existing = await attempt(() => WordPressService.searchPosts(blog.title));
      if (!existing.ok) return existing;
      const own = findOwnPost(existing.value, blog.title, new Date(ctx.createdAt));
      let post: { id: number; link: string };
      if (own) {
        post = { id: own.id, link: own.link };
      } else {
        const tagIds = await WordPressService.resolveTagIds(blog.tags).catch(() => [] as number[]);
        const images: Record<string, WordPressImage> = {};
        for (const img of blog.images) if (media[img.id]) images[img.id] = { ...media[img.id], alt: img.alt, caption: img.caption };
        const hero = blog.images.find((i) => i.role === "hero");
        const res = await attempt(() => WordPressService.createPost({
          title: blog.title,
          content: blogToWordPressHtml(blog.blocks, images),
          excerpt: blog.meta_description,
          slug: blog.slug,
          featuredMediaId: hero && media[hero.id] ? media[hero.id].id : null,
          tagIds,
          categoryId: env.WORDPRESS_CATEGORY_ID ?? null,
        }));
        if (!res.ok) return res;
        post = { id: res.value.id, link: res.value.link };
      }
      // Saved before finishing, so even a crash here can't lead to a second post.
      await supabase.from("blog_publications").update({ wp_post_id: post.id, wp_url: post.link }).eq("id", publicationId).eq("locked_by", worker);
      return { ok: true, value: { post } } as const;
    })) as Outcome<{ blocked: string } | { post: { id: number; link: string } }>;

    if (!created.ok) return fail(created);
    if ("blocked" in created.value) return { status: await finish("finish-blocked", "blocked", { error: created.value.blocked }) };
    const { post } = created.value;
    return { status: await finish("finish-published", "published", { postId: post.id, url: post.link }), postId: post.id, url: post.link };
    }
  }
);

/**
 * After a Live blog finishes generating, its blog_publications row already exists
 * (a DB trigger creates it, timed for the blog's AI-chosen publish time); this sends
 * the event that publishes it, timed for that moment. A no-op for Testing content
 * and for social/LinkedIn, which never get a row.
 */
export async function kickBlogPublication(step: Step, contentId: string) {
  const pub = await step.run("find-blog-publication", async () => {
    const { data } = await supabase.from("blog_publications").select("id, status, next_attempt_at").eq("property_content_id", contentId).maybeSingle();
    return data;
  });
  if (pub?.status === "pending") {
    await step.sendEvent("publish-blog", {
      name: "content/blog-publish", data: { publicationId: pub.id },
      ts: Math.max(Date.now(), Date.parse(pub.next_attempt_at as string) || Date.now()),
    });
  }
}
