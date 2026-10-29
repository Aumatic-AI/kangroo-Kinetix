import { uploadPostGet, uploadPostDelete, uploadPostPatch } from "./client";
import { UploadPostScheduledJob } from "./types";

export async function listScheduledPosts(): Promise<UploadPostScheduledJob[]> {
  const data = await uploadPostGet("/uploadposts/schedule");
  return data.jobs || data.scheduled_posts || data.data || [];
}

export async function cancelScheduledPost(jobId: string): Promise<{ success: boolean; message?: string }> {
  return uploadPostDelete(`/uploadposts/schedule/${encodeURIComponent(jobId)}`);
}

export interface UpdateScheduledPostPatch {
  scheduledDate?: string;
  timezone?: string;
  title?: string;
  caption?: string;
}

export async function updateScheduledPost(jobId: string, patch: UpdateScheduledPostPatch) {
  const body: Record<string, any> = {};
  if (patch.scheduledDate) body.scheduled_date = patch.scheduledDate;
  if (patch.timezone) body.timezone = patch.timezone;
  if (patch.title) body.title = patch.title;
  if (patch.caption) body.caption = patch.caption;
  return uploadPostPatch(`/uploadposts/schedule/${encodeURIComponent(jobId)}`, body);
}
