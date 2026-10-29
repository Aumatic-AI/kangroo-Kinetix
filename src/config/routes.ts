export const ROUTES = {
  AUTH: {
    LOGIN: "/login",
    SIGNUP: "/signup",
  },
  DASHBOARD: {
    HOME: "/dashboard",
  },
  META_ADS: {
    DASHBOARD: "/meta-ads",
    AD_LIBRARY: "/meta-ads/ad-library",
    CAMPAIGNS: "/meta-ads/campaigns",
    CAMPAIGN_CREATE: "/meta-ads/campaigns/create",
    CAMPAIGN_DETAIL: (campaignId: string) => `/meta-ads/campaigns/${campaignId}`,
    AD_SET_DETAIL: (campaignId: string, adSetId: string) => `/meta-ads/campaigns/${campaignId}/${adSetId}`,
    AD_DETAIL: (campaignId: string, adSetId: string, adId: string) => `/meta-ads/campaigns/${campaignId}/${adSetId}/${adId}`,
    REPORTS: "/meta-ads/reports",
    LEADS: "/meta-ads/leads",
    AD_STUDIO: "/meta-ads/ad-library/studio",
    AD_STUDIO_SESSION: (sessionId: string) => `/meta-ads/ad-library/studio/${sessionId}`,
  },
  OUTREACH: {
    DASHBOARD: "/outreach",
    LEADS: "/outreach/leads",
    CAMPAIGNS: "/outreach/campaigns",
    CAMPAIGN_NEW: "/outreach/campaigns/new",
    CAMPAIGN_DETAIL: (id: string) => `/outreach/campaigns/${id}`,
  },
  SOCIAL: {
    DASHBOARD: "/social",
    CONNECTED_ACCOUNTS: "/social/connected-accounts",
    POSTS: "/social/posts",
    POSTS_PUBLISH: "/social/posts/publish",
    PUBLISHED: "/social/published",
  },
  SETTINGS: {
    ROOT: "/settings",
  },
} as const;
