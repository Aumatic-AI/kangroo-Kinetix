/**
 * Upload-Post is the one publishing backend this app uses for organic
 * social posting. Accounts are connected directly on the Upload-Post
 * dashboard (app.upload-post.com/manage-users), not through our own OAuth
 * — `services/social/oauth` is kept for a possible future switch, but
 * nothing in the app calls it for publishing right now.
 *
 * `UploadPostService` is the single import surface every call site should
 * use — the individual modules (profiles/publish/status/schedule/facebook)
 * exist to keep this file thin, not to be imported directly.
 */

import { getProfile, listProfiles } from "./profiles";
import { publishVideo, publishPhotos, publishText } from "./publish";
import { getUploadStatus } from "./status";
import { listScheduledPosts, cancelScheduledPost, updateScheduledPost } from "./schedule";
import { getFacebookPages } from "./facebook";
import { getLinkedInPages } from "./linkedin";
import { getProfileAnalytics, getTotalImpressions, getCachedPostAnalytics } from "./analytics";
export { buildProfileUrl } from "./profile-url";

export * from "./types";
export type { PublishVideoParams, PublishPhotosParams, PublishTextParams } from "./publish";
export type { UpdateScheduledPostPatch } from "./schedule";

export class UploadPostService {
  static getProfile = getProfile;
  static listProfiles = listProfiles;

  static publishVideo = publishVideo;
  static publishPhotos = publishPhotos;
  static publishText = publishText;

  static getUploadStatus = getUploadStatus;

  static listScheduledPosts = listScheduledPosts;
  static cancelScheduledPost = cancelScheduledPost;
  static updateScheduledPost = updateScheduledPost;

  static getFacebookPages = getFacebookPages;
  static getLinkedInPages = getLinkedInPages;

  static getProfileAnalytics = getProfileAnalytics;
  static getTotalImpressions = getTotalImpressions;
  static getCachedPostAnalytics = getCachedPostAnalytics;
}
