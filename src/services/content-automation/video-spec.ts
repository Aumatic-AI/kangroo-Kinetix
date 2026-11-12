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

/**
 * The ending, done in code on the renderer after Seedance (never asked of the video model):
 * the clip dips to black over its last END_FADE_SECONDS (the picture and the corner logo together,
 * the audio fading out underneath), then a END_CARD_SECONDS card — the white Kangrooo logo fading
 * in on black — is appended. Final length ≈ the clip + END_CARD_SECONDS.
 */
export const END_CARD_SECONDS = 1;
export const END_FADE_SECONDS = 0.5;
/** Shorter than the picture fade so the narrator's last word isn't swallowed. */
export const END_AUDIO_FADE_SECONDS = 0.4;
export const END_CARD_LOGO_FADE_SECONDS = 0.4;
/** Bump when the card's design or timing changes (it's part of the cached card image path). */
export const END_CARD_VERSION = "v1";
