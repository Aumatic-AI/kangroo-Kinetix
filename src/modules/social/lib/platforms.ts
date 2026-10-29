import { FaFacebook, FaInstagram, FaYoutube, FaXTwitter, FaLinkedin, FaTiktok } from "react-icons/fa6";

export type Platform = "facebook" | "instagram" | "youtube" | "x" | "linkedin" | "tiktok";

export interface PlatformMeta {
  platform: Platform;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsTextOnly: boolean;
}

export const PLATFORMS: PlatformMeta[] = [
  { platform: "facebook", label: "Facebook", color: "#1877F2", icon: FaFacebook, supportsImage: true, supportsVideo: true, supportsTextOnly: true },
  { platform: "instagram", label: "Instagram", color: "#E1306C", icon: FaInstagram, supportsImage: true, supportsVideo: true, supportsTextOnly: false },
  { platform: "youtube", label: "YouTube", color: "#FF0000", icon: FaYoutube, supportsImage: false, supportsVideo: true, supportsTextOnly: false },
  { platform: "x", label: "X (Twitter)", color: "#000000", icon: FaXTwitter, supportsImage: true, supportsVideo: true, supportsTextOnly: true },
  { platform: "linkedin", label: "LinkedIn", color: "#0A66C2", icon: FaLinkedin, supportsImage: true, supportsVideo: true, supportsTextOnly: true },
  { platform: "tiktok", label: "TikTok", color: "#000000", icon: FaTiktok, supportsImage: false, supportsVideo: true, supportsTextOnly: false },
];

export function platformMeta(platform: string): PlatformMeta | undefined {
  return PLATFORMS.find((p) => p.platform === platform);
}

export function platformsSupporting(format: "image" | "video" | "text"): PlatformMeta[] {
  return PLATFORMS.filter((p) => (format === "image" ? p.supportsImage : format === "video" ? p.supportsVideo : p.supportsTextOnly));
}

export function formatFollowerCount(n?: number): string | null {
  if (n === undefined || n === null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
