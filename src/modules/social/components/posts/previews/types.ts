export interface PreviewAccount {
  displayName: string;
  avatarUrl?: string;
}

export interface PlatformPreviewProps {
  platform: "facebook" | "instagram" | "youtube" | "x" | "linkedin" | "tiktok";
  account: PreviewAccount;
  caption: string;
  title?: string;
  /** Empty/omitted for a text-only post (Facebook, X, LinkedIn support these
   * — Instagram/YouTube/TikTok require media, so never render without it). */
  mediaUrl?: string;
  mediaType?: "image" | "video";
}
