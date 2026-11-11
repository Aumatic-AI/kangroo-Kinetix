"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/modules/listings/components/ListingBits";
import type { BlogBlock, BlogDoc, BlogImage } from "../types/content.types";

function Figure({ image }: { image: BlogImage | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!image?.url || failed) return null;
  return (
    <figure className="space-y-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={image.alt} loading="lazy" onError={() => setFailed(true)} className="w-full rounded-lg border border-default bg-surface object-cover" />
      {image.caption && <figcaption className="text-xs text-muted">{image.caption}</figcaption>}
    </figure>
  );
}

function Block({ block, images }: { block: BlogBlock; images: Map<string, BlogImage> }) {
  switch (block.type) {
    case "heading":
      return block.level === 3
        ? <h4 className="text-base font-semibold text-text pt-1">{block.text}</h4>
        : <h3 className="text-lg font-semibold text-text pt-2">{block.text}</h3>;
    case "paragraph":
      return <p className="text-sm text-text leading-relaxed">{block.text}</p>;
    case "list": {
      const Tag = block.style === "numbered" ? "ol" : "ul";
      return (
        <Tag className={`text-sm text-text leading-relaxed pl-5 space-y-1 ${block.style === "numbered" ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, i) => <li key={i}>{item}</li>)}
        </Tag>
      );
    }
    case "callout":
      return (
        <div className="rounded-lg border border-default bg-surface px-4 py-3">
          {block.label && <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{block.label}</p>}
          <p className="text-sm text-text leading-relaxed">{block.text}</p>
        </div>
      );
    case "faq":
      return (
        <div className="space-y-3">
          {block.items.map((f, i) => (
            <div key={i} className="space-y-1">
              <p className="text-sm font-semibold text-text">{f.q}</p>
              <p className="text-sm text-text leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      );
    case "image":
      return <Figure image={images.get(block.image_id)} />;
  }
}

/**
 * The blog post as readers would see it — hero, title, body — plus what the AI
 * decided (format, angle). `markdown` is the exact Markdown copy stored on the
 * revision; the copy button is the only way the post leaves the gallery.
 */
export function BlogView({ blog, heroUrl, markdown }: { blog: BlogDoc; heroUrl: string | null; markdown: string | null }) {
  const [copied, setCopied] = useState(false);
  const images = new Map(blog.images.map((i) => [i.id, i]));
  const hero = blog.images.find((i) => i.role === "hero");

  const copy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  return (
    <article className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Pill>{blog.format}</Pill>
        {blog.wordCount > 0 && <Pill>{blog.wordCount.toLocaleString()} words</Pill>}
        <Pill>{blog.images.length} image{blog.images.length === 1 ? "" : "s"}</Pill>
        <div className="ml-auto">
          <Button size="sm" variant="outline" disabled={!markdown} onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy Markdown"}
          </Button>
        </div>
      </div>

      <Figure image={heroUrl ? { id: "hero", role: "hero", alt: hero?.alt ?? blog.title, caption: hero?.caption ?? "", url: heroUrl } : hero} />

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-text">{blog.title}</h2>
        <p className="text-sm text-muted">{blog.metaDescription}</p>
      </div>

      <div className="space-y-4">
        {blog.blocks.map((b, i) => <Block key={i} block={b} images={images} />)}
      </div>

      {blog.tags.length > 0 && <p className="text-sm text-muted">{blog.tags.map((t) => `#${t}`).join(" ")}</p>}
    </article>
  );
}
