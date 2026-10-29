import { PlatformPreviewProps } from "./types";
import { FacebookPreview } from "./FacebookPreview";
import { InstagramPreview } from "./InstagramPreview";
import { XPreview } from "./XPreview";
import { LinkedInPreview } from "./LinkedInPreview";
import { TikTokPreview } from "./TikTokPreview";
import { YouTubePreview } from "./YouTubePreview";

export * from "./types";

/** Renders a mock of exactly how a post will look once it's live on the
 * given platform — same avatar, name, caption layout, and action icons as
 * the real feed, so "preview" actually means something before publishing. */
export function PlatformPreview(props: PlatformPreviewProps) {
  switch (props.platform) {
    case "facebook":
      return <FacebookPreview {...props} />;
    case "instagram":
      return <InstagramPreview {...props} />;
    case "x":
      return <XPreview {...props} />;
    case "linkedin":
      return <LinkedInPreview {...props} />;
    case "tiktok":
      return <TikTokPreview {...props} />;
    case "youtube":
      return <YouTubePreview {...props} />;
    default:
      return null;
  }
}
