import { generateSocialImage } from "./social";
import { processContentQueue, generateContentJob, regenerateContentRevision, weeklyContentCycle } from "./content";
import { socialScheduledPostCheck } from "@/jobs/social-scheduled-post-check.job";

export const functions = [
  socialScheduledPostCheck,
  generateSocialImage,
  processContentQueue,
  generateContentJob,
  regenerateContentRevision,
  weeklyContentCycle,
];
