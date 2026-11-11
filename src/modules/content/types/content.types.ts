export type ContentPipeline = "social" | "linkedin" | "blog";
export type ContentType = "video" | "image" | "text_image" | "blog";
export type GenerationStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type ValidationStatus = "pending" | "valid" | "invalid";

export interface ProposedSlot {
  platform: string;
  scheduled_at: string;   // UTC ISO
  timezone: string;
  local: string;          // "YYYY-MM-DD HH:MM" in `timezone`
  reason: string;
  adjusted: boolean;
  source?: "week_plan" | "per_creative";
}

export interface PlatformPostInfo { text: string; hashtags: string[]; truncated: boolean }

/** What was actually measured on the generated file, plus each platform's verdict. */
export interface MediaInfo {
  kind: "image" | "video";
  width: number;
  height: number;
  sizeBytes: number;
  durationSeconds?: number;
  fps?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  hasAudio?: boolean;
  format?: string;
  /** platform → problems found (empty array = passes). Null for LinkedIn / not yet checked. */
  checks: Record<string, string[]> | null;
  warnings: string[];
}

/** One building block of a blog post — the AI chooses the mix, so the shape is open-ended. */
export type BlogBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; style: "bullet" | "numbered"; items: string[] }
  | { type: "callout"; label: string; text: string }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "image"; image_id: string };

export interface BlogImage { id: string; role: "hero" | "inline"; alt: string; caption: string; url: string | null }

/** The structured blog post stored on the revision (content_decision.blog). */
export interface BlogDoc {
  title: string;
  slug: string;
  metaDescription: string;
  /** The format the AI chose for this run, e.g. "event planning guide". */
  format: string;
  formatReason: string;
  angle: string;
  reason: string;
  tags: string[];
  blocks: BlogBlock[];
  images: BlogImage[];
  wordCount: number;
  /** What the AI saw in the listing photos (grounding). */
  observations: string[];
}

export interface RevisionSummary {
  id: string;
  number: number;
  caption: string | null;
  hashtags: string[];
  script: string | null;
  videoFormat: "single_clip" | null;
  videoDuration: number | null;
  formatReason: string | null;
  validation: ValidationStatus;
  validationErrors: string[] | null;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  proposedSchedule: ProposedSlot[] | null;
  platformPosts: Record<string, PlatformPostInfo> | null;
  mediaInfo: MediaInfo | null;
  /** Set for blog revisions in the detail view only. */
  blog: BlogDoc | null;
  /** The QA gates' results and the weekly-mix assignment (social/LinkedIn creatives from the QA pipeline on). */
  qa: RevisionQa | null;
  guidance: string | null;
  createdAt: string;
}

export interface GalleryItem {
  id: string;
  propertyId: string;
  propertyTitle: string;
  city: string | null;
  pipeline: ContentPipeline;
  contentType: ContentType;
  environment: "testing" | "live";
  generationStatus: GenerationStatus;
  createdAt: string;
  revisionCount: number;
  /** A regeneration is in flight (pending revision) while the current one stays visible. */
  regenerating: boolean;
  current: RevisionSummary | null;
  /** With no valid version: the newest attempt that has media (e.g. a video the checks rejected), so it can still be watched. */
  latestAttempt: RevisionSummary | null;
}

export interface GalleryResponse {
  items: GalleryItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ClipSummary { index: number; status: string; durationSeconds: number | null; mediaUrl: string | null; lastError: string | null; attempts: number }

export interface ContentDetail {
  item: GalleryItem;
  revisions: RevisionSummary[];
  clips: Record<string, ClipSummary[]>;   // by revision id
  decision: { reason?: string; concept?: string; theme?: string; strategy?: CreativeStrategySummary; warnings?: string[] } | null;
}

export interface RevisionQa {
  brief: { score: number; passed: boolean; rounds: number; issues: { dimension: string; problem: string; fix: string }[] } | null;
  media: { status: "passed" | "failed" | "unavailable" | "skipped"; blockers: string[]; warnings: string[]; reason?: string } | null;
  assignment: { objective: string; framework: string; hookType: string } | null;
  /** Set on a revision the pipeline re-rendered after a failed media check. */
  retryOf: string | null;
}

/** The agent's strategic diagnosis for a social/LinkedIn creative (absent on blogs and older creatives). */
export interface CreativeStrategySummary {
  eventType: string;
  persona: string;
  desire: string;
  awarenessLevel: string;
  objective: string;
  angle: string;
  framework: string;
  levers: string[];
  hookType: string;
  hookLine: string;
  payoff: string;
  people: string | null;
  /** Video only: how many of its shots the agent chose to show with background guests. */
  peopleShots: { withGuests: number; total: number } | null;
  /** Video only: the narrator's voice the agent chose from the script's mood. */
  voice: { mood: string; delivery: string } | null;
}

export interface ActivityJob {
  id: string;
  pipeline: ContentPipeline;
  status: GenerationStatus;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  propertyTitle: string | null;
  contentType: ContentType | null;
  createdAt: string;
}
export interface ActivityResponse {
  cycles: { id: string; weekStart: string; weekEnd: string; status: string; socialTarget: number; linkedinTarget: number; blogTarget: number }[];
  jobs: ActivityJob[];
}

export interface AutomationSettings {
  socialFrequency: number;
  linkedinFrequency: number;
  blogFrequency: number;
  mode: "testing" | "live";
  isEnabled: boolean;
  autoRunEnabled: boolean;
  timezone: string;
  canAdmin: boolean;
}
