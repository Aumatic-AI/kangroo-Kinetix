import { uploadPostGet } from "./client";
import { UploadPostStatusResponse } from "./types";

/** Pass whichever id you have: `requestId` for an async (non-scheduled)
 * upload, `jobId` for a scheduled one. */
export async function getUploadStatus(params: { requestId?: string; jobId?: string }): Promise<UploadPostStatusResponse> {
  if (!params.requestId && !params.jobId) throw new Error("getUploadStatus requires a requestId or jobId");
  return uploadPostGet("/uploadposts/status", params.requestId ? { request_id: params.requestId } : { job_id: params.jobId });
}
