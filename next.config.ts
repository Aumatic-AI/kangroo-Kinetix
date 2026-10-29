import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage — media_assets/meta_ad_creatives public URLs
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      // Upload-Post's avatar storage (both region buckets share this host)
      { protocol: "https", hostname: "storage.googleapis.com" },
      // Facebook/Instagram Page picture — served straight from Graph API's
      // own `picture` field, not proxied through Upload-Post's storage, and
      // spread across many numbered edge subdomains (scontent-fra5-2, etc.)
      { protocol: "https", hostname: "*.fbcdn.net" },
      // LinkedIn Page/profile picture — same situation, served directly
      // from LinkedIn's own CDN.
      { protocol: "https", hostname: "*.licdn.com" },
    ],
  },
};

export default nextConfig;
