import { UploadPostPlatform, UploadPostSocialAccount, UploadPostFacebookPage, UploadPostLinkedInPage } from "./types";

/**
 * The public URL for the account actually being posted to — a Page for
 * Facebook/LinkedIn (not the personal login that authorized Upload-Post),
 * a handle-based profile URL everywhere else. Returns undefined when there
 * isn't enough info to build a reliable link rather than guessing one.
 */
export function buildProfileUrl(
  platform: UploadPostPlatform,
  account: UploadPostSocialAccount,
  page?: UploadPostFacebookPage | UploadPostLinkedInPage
): string | undefined {
  switch (platform) {
    case "facebook":
      return page ? `https://www.facebook.com/${page.id}` : undefined;
    case "instagram":
      return account.handle ? `https://www.instagram.com/${account.handle.replace(/^@/, "")}/` : undefined;
    case "youtube":
      if (account.handle) return `https://www.youtube.com/${account.handle.startsWith("@") ? account.handle : `@${account.handle}`}`;
      return account.username ? `https://www.youtube.com/channel/${account.username}` : undefined;
    case "x":
      return account.handle ? `https://x.com/${account.handle.replace(/^@/, "")}` : undefined;
    case "tiktok":
      return account.handle ? `https://www.tiktok.com/@${account.handle.replace(/^@/, "")}` : undefined;
    case "linkedin": {
      const linkedinPage = page as UploadPostLinkedInPage | undefined;
      if (linkedinPage?.vanityName) return `https://www.linkedin.com/company/${linkedinPage.vanityName}/`;
      if (linkedinPage?.id) {
        const numericId = linkedinPage.id.split(":").pop();
        return numericId ? `https://www.linkedin.com/company/${numericId}/` : undefined;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}
