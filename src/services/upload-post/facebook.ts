import { uploadPostGet } from "./client";
import { UploadPostFacebookPage } from "./types";

/** Facebook posting needs a `facebook_page_id` — a Page, not a personal
 * profile. A connected account may have access to more than one Page; for
 * this single-tenant app we just take the first one, mirroring the same
 * simplification already used in the OAuth Facebook connect flow. */
export async function getFacebookPages(username: string): Promise<UploadPostFacebookPage[]> {
  const data = await uploadPostGet(`/uploadposts/facebook/pages`, { user: username });
  return data.pages || data.data || [];
}
