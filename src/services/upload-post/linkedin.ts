import { uploadPostGet } from "./client";
import { UploadPostLinkedInPage } from "./types";

/** LinkedIn can post as the personal profile or as a connected Company
 * Page (`target_linkedin_page_id`, a `urn:li:organization:...` id) — the
 * proven legacy pipeline always posted to the client's Company Page, so
 * we resolve and use it the same way here whenever one is available. */
export async function getLinkedInPages(username: string): Promise<UploadPostLinkedInPage[]> {
  const data = await uploadPostGet(`/uploadposts/linkedin/pages`, { user: username });
  return data.pages || data.data || [];
}
