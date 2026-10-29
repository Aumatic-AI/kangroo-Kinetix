import { uploadPostPostForm } from "./client";
import { UploadPostPlatform, UploadPostPublishResponse } from "./types";

interface BasePublishParams {
  /** The Upload-Post profile username (env.UPLOAD_POST_PROFILE). */
  user: string;
  platforms: UploadPostPlatform[];
  title: string;
  description?: string;
  /** ISO-8601, ≤365 days out. Presence alone is what triggers scheduling —
   * the API responds 202 + a `job_id` instead of publishing immediately. */
  scheduledDate?: string;
  /** IANA timezone (e.g. "America/New_York"); Upload-Post assumes UTC if omitted. */
  timezone?: string;
  /** Required by Upload-Post whenever "facebook" is one of the platforms. */
  facebookPageId?: string;
  /** Optional — post to a LinkedIn Company Page instead of the personal profile. */
  linkedinPageId?: string;
}

function buildBaseForm(params: BasePublishParams): FormData {
  const form = new FormData();
  form.append("user", params.user);
  params.platforms.forEach((p) => form.append("platform[]", p));
  form.append("title", params.title);
  if (params.description) form.append("description", params.description);
  if (params.scheduledDate) form.append("scheduled_date", params.scheduledDate);
  if (params.timezone) form.append("timezone", params.timezone);
  if (params.platforms.includes("facebook") && params.facebookPageId) form.append("facebook_page_id", params.facebookPageId);
  if (params.platforms.includes("linkedin") && params.linkedinPageId) form.append("target_linkedin_page_id", params.linkedinPageId);
  return form;
}

export interface PublishVideoParams extends BasePublishParams {
  /** A publicly reachable URL — Upload-Post fetches it server-side, same
   * as our own `media_assets.metadata.publicUrl`. No need to download and
   * re-upload bytes ourselves. */
  videoUrl: string;
}

export async function publishVideo(params: PublishVideoParams): Promise<UploadPostPublishResponse> {
  const form = buildBaseForm(params);
  form.append("video", params.videoUrl);
  return uploadPostPostForm("/upload", form);
}

export interface PublishPhotosParams extends BasePublishParams {
  photoUrls: string[];
}

export async function publishPhotos(params: PublishPhotosParams): Promise<UploadPostPublishResponse> {
  const form = buildBaseForm(params);
  params.photoUrls.forEach((url) => form.append("photos[]", url));
  return uploadPostPostForm("/upload_photos", form);
}

export type PublishTextParams = BasePublishParams;

export async function publishText(params: PublishTextParams): Promise<UploadPostPublishResponse> {
  const form = buildBaseForm(params);
  return uploadPostPostForm("/upload_text", form);
}
