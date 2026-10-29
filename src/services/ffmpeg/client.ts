/**
 * FFmpeg Service Wrapper
 *
 * Interacts with the external api.upload-post.com FFmpeg rendering API.
 * This can be reused across any module to stitch, transcode, or edit videos.
 */

import { env } from "@/config/env";

interface FFmpegJobOptions {
  files: string[];
  command: string;
  outputExtension?: string;
}

interface FFmpegJobStatus {
  status: 'pending' | 'finished' | 'failed' | 'error';
  url?: string;
  error?: string;
}

export class FFmpegService {
  private static API_URL = "https://api.upload-post.com/api/uploadposts/ffmpeg";

  static getHeaders() {
    if (!env.FFMPEG_API_KEY) {
      throw new Error("FFMPEG_API_KEY is not set");
    }
    return {
      "Content-Type": "application/json",
      "Authorization": env.FFMPEG_API_KEY
    };
  }

  /**
   * Submits a new FFmpeg job to the external renderer.
   * @param options Object containing the files array and the raw FFmpeg command.
   * @returns The generated job_id string.
   */
  static async submitJob(options: FFmpegJobOptions): Promise<string> {
    const payload = {
      files: options.files,
      full_command: options.command,
      output_extension: options.outputExtension || "mp4"
    };

    const response = await fetch(`${this.API_URL}/jobs/upload`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to submit FFmpeg job: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.job_id) {
      throw new Error("FFmpeg API did not return a job_id");
    }

    return data.job_id;
  }

  /**
   * Checks the status of a running FFmpeg job.
   * If finished, it will automatically fetch the download URL.
   * @param jobId The job_id returned by submitJob
   */
  static async checkStatus(jobId: string): Promise<FFmpegJobStatus> {
    const response = await fetch(`${this.API_URL}/jobs/${jobId}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to check FFmpeg job status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    
    // If the API returns the video directly (or redirects to it), fetch will follow it.
    if (!contentType.includes("application/json")) {
      return {
        status: 'finished',
        url: response.url
      };
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Fallback if it's not valid JSON but the request succeeded
      return {
        status: 'finished',
        url: response.url
      };
    }

    if (data.status === "finished") {
      // Job is done, let's fetch the actual file URL
      const dlRes = await fetch(`${this.API_URL}/jobs/${jobId}/download`, {
        headers: this.getHeaders()
      });
      
      if (!dlRes.ok) {
        throw new Error("Job finished but failed to retrieve download URL");
      }
      
      const dlContentType = dlRes.headers.get("content-type") || "";
      if (!dlContentType.includes("application/json")) {
        return { status: 'finished', url: dlRes.url };
      }

      const dlData = await dlRes.json();
      return {
        status: 'finished',
        url: dlData.url || dlData.download_url || dlData.file_url || dlRes.url
      };
    }

    return {
      status: data.status,
      error: data.error
    };
  }
}
