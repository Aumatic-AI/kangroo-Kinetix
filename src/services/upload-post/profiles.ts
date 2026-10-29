import { uploadPostGet } from "./client";
import { UploadPostProfile } from "./types";

/** The one profile (`username`) our single-tenant business's accounts are
 * connected under on the Upload-Post dashboard — see `env.UPLOAD_POST_PROFILE`. */
export async function getProfile(username: string): Promise<UploadPostProfile> {
  const data = await uploadPostGet(`/uploadposts/users/${encodeURIComponent(username)}`);
  return data.profile;
}

export async function listProfiles(): Promise<UploadPostProfile[]> {
  const data = await uploadPostGet(`/uploadposts/users`);
  return data.profiles || [];
}
