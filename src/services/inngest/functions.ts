import { generateImageAd, generateVideoAd, generateStudioImage, editStudioImage } from "./meta-ads";
import { generateSocialImage, generateSocialVideo } from "./social";
import { sendOutreachCampaign } from "./outreach";
import { metaAdsPerformanceSyncJob } from "@/jobs/meta-ads-performance-sync.job";
import { socialScheduledPostCheck } from "@/jobs/social-scheduled-post-check.job";

export const functions = [
  metaAdsPerformanceSyncJob,
  socialScheduledPostCheck,
  generateImageAd,
  generateVideoAd,
  generateStudioImage,
  editStudioImage,
  generateSocialImage,
  generateSocialVideo,
  sendOutreachCampaign,
];
