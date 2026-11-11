/**
 * The fixed shape of every generated video: ONE clip, 30 seconds, 480p, 9:16. The AI
 * chooses neither the length nor a second clip. Seedance 2.5 allows 4–30 s per clip and
 * every social platform's maximum (Facebook 90 s is the lowest) is above 30 s.
 */
export const VIDEO_TOTAL_SECONDS = 30;
export const VIDEO_FORMAT = "single_clip" as const;
export const VIDEO_RESOLUTION = "480p" as const;
/** 9:16 at 480p; both sides even, as x264 requires. */
export const VIDEO_WIDTH = 480;
export const VIDEO_HEIGHT = 854;
