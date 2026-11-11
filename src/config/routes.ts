export const ROUTES = {
  AUTH: {
    LOGIN: "/login",
  },
  DASHBOARD: {
    HOME: "/dashboard",
  },
  SOCIAL: {
    DASHBOARD: "/social",
    CONNECTED_ACCOUNTS: "/social/connected-accounts",
    POSTS: "/social/posts",
    POSTS_PUBLISH: "/social/posts/publish",
    PUBLISHED: "/social/published",
  },
  CONTENT: {
    GALLERY: "/content",
    AUTOMATION: "/content/automation",
  },
  LISTINGS: {
    ROOT: "/listings",
  },
  SETTINGS: {
    ROOT: "/settings",
  },
} as const;
