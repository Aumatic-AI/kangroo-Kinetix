/**
 * Deterministic scheduling helpers. The AI PROPOSES a day/time per platform;
 * everything here enforces it (spec §13.6: "the AI proposes, deterministic
 * backend validation enforces"). Pure functions — no I/O — so they're unit-tested.
 * Timestamps are produced in UTC; the IANA timezone is stored alongside.
 */

export interface ProposedSlot {
  platform: string;
  /** UTC instant, ISO-8601. */
  scheduled_at: string;
  timezone: string;
  /** Local wall-clock "YYYY-MM-DD HH:MM" in `timezone` (display only). */
  local: string;
  reason: string;
  /** true when the AI's proposal was adjusted or replaced by the validator. */
  adjusted: boolean;
  /** Where the slot came from: the week's joint plan, or chosen for this creative alone. */
  source?: "week_plan" | "per_creative";
}

/** One planned post of a pipeline: its queue slot_index and a time per platform. */
export interface PlannedPost { slot_index: number; slots: ProposedSlot[] }

export interface WeekPlan {
  timezone: string;
  planned_at: string;
  social: PlannedPost[];
  linkedin: PlannedPost[];
}

export const POSTING_HOURS = { earliest: "08:00", latest: "21:30" } as const;
/** Minimum gap between two posts on the SAME platform (spec §4.3: avoid clustering). */
export const MIN_SAME_PLATFORM_GAP_MS = 20 * 3_600_000;

const pad = (n: number) => String(n).padStart(2, "0");

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

/** Local wall-clock → UTC ms, handling DST (re-checks the offset at the result). */
export function zonedLocalToUtcMs(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMs(guess, tz);
  let utc = guess - off1;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function clampTime(time: string): { time: string; changed: boolean } {
  if (time < POSTING_HOURS.earliest) return { time: POSTING_HOURS.earliest, changed: true };
  if (time > POSTING_HOURS.latest) return { time: POSTING_HOURS.latest, changed: true };
  return { time, changed: false };
}

/** Sensible defaults used when the AI gives nothing usable for a platform. */
const FALLBACK: Record<string, { dayOffsets: number[]; time: string }> = {
  instagram: { dayOffsets: [1, 3, 5, 0, 2, 4, 6], time: "19:00" },
  facebook: { dayOffsets: [2, 4, 6, 1, 3, 5, 0], time: "12:30" },
  tiktok: { dayOffsets: [3, 5, 1, 6, 0, 2, 4], time: "20:00" },
  linkedin: { dayOffsets: [1, 2, 3, 4, 0], time: "09:30" },
};

interface RawSlot { platform?: unknown; date?: unknown; time?: unknown; reason?: unknown }

/**
 * Turns the AI's raw slots into validated ones: exactly one per requested
 * platform, inside the week, inside posting hours, and ≥ MIN_SAME_PLATFORM_GAP
 * from any `taken` slot on the same platform. Anything unusable falls back to a
 * deterministic default, flagged `adjusted`.
 */
export function validateProposedSchedule(args: {
  weekStart: string;
  timezone: string;
  platforms: string[];
  raw: unknown;
  /** Slots already proposed for other creatives this week (UTC ms per platform). */
  taken: { platform: string; ms: number }[];
}): ProposedSlot[] {
  const tz = isValidTimezone(args.timezone) ? args.timezone : "America/Toronto";
  const maybeSlots = (args.raw as { slots?: unknown } | null | undefined)?.slots;
  const rawSlots: RawSlot[] = Array.isArray(maybeSlots) ? (maybeSlots as RawSlot[]) : [];
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(args.weekStart, i));
  const taken = [...args.taken];
  const out: ProposedSlot[] = [];

  for (const platform of args.platforms) {
    const ai = rawSlots.find((s) => s && typeof s.platform === "string" && s.platform.toLowerCase() === platform);
    let date: string | null = null;
    let time: string | null = null;
    let reason = typeof ai?.reason === "string" ? ai.reason.slice(0, 200) : "";
    let adjusted = false;

    if (ai && typeof ai.date === "string" && DATE_RE.test(ai.date) && weekDates.includes(ai.date) && typeof ai.time === "string" && TIME_RE.test(ai.time)) {
      date = ai.date;
      const c = clampTime(ai.time);
      time = c.time;
      adjusted = c.changed;
    } else {
      adjusted = true;
    }

    const fb = FALLBACK[platform] ?? FALLBACK.instagram;
    const conflicts = (ms: number) => taken.some((t) => t.platform === platform && Math.abs(t.ms - ms) < MIN_SAME_PLATFORM_GAP_MS);

    let ms = date && time ? zonedLocalToUtcMs(date, time, tz) : NaN;
    if (Number.isNaN(ms) || conflicts(ms)) {
      adjusted = true;
      time = date && time && !conflicts(ms) ? time : fb.time;
      // try the AI's date first (if valid and only the gap conflicted), then fallback days
      const candidates = [...(date ? [date] : []), ...fb.dayOffsets.map((o) => weekDates[o]), ...weekDates];
      const found = candidates.find((d) => !conflicts(zonedLocalToUtcMs(d, time!, tz)));
      date = found ?? candidates[0];
      ms = zonedLocalToUtcMs(date, time!, tz);
      if (!reason) reason = "default slot (AI proposal unavailable or clustered)";
    }

    taken.push({ platform, ms });
    out.push({
      platform,
      scheduled_at: new Date(ms).toISOString(),
      timezone: tz,
      local: `${date} ${time}`,
      reason: reason || "AI-proposed slot",
      adjusted,
    });
  }
  return out;
}

/** Week (Monday start) in which a UTC instant falls, as the cycle's week_start. */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(dateStr, -dow);
}

/**
 * Plans every post of one pipeline for the week TOGETHER. `raw` is the AI's
 * `{ posts: [{ slot_index, slots: [{platform,date,time,reason}] }] }`. Posts are
 * validated one after another, each against every earlier post (and any
 * `existing` ones), so the same-platform spacing, posting hours and in-week
 * rules hold ACROSS the whole plan — not just within one creative. Anything the
 * AI omits or gets wrong is replaced by deterministic defaults, which spread
 * across different days. Returns only the posts that weren't already planned.
 */
export function validateWeekPlan(args: {
  weekStart: string;
  timezone: string;
  platforms: string[];
  count: number;
  raw: unknown;
  existing?: PlannedPost[];
}): PlannedPost[] {
  const have = new Set((args.existing ?? []).map((p) => p.slot_index));
  const taken: { platform: string; ms: number }[] = [];
  for (const p of args.existing ?? []) for (const s of p.slots) taken.push({ platform: s.platform, ms: Date.parse(s.scheduled_at) });

  const rawPosts = (args.raw as { posts?: unknown } | null | undefined)?.posts;
  const posts = Array.isArray(rawPosts) ? (rawPosts as { slot_index?: unknown; slots?: unknown }[]) : [];

  const out: PlannedPost[] = [];
  for (let i = 1; i <= args.count; i++) {
    if (have.has(i)) continue;
    const ai = posts.find((p) => p && typeof p === "object" && Number(p.slot_index) === i);
    const slots = validateProposedSchedule({
      weekStart: args.weekStart, timezone: args.timezone, platforms: args.platforms,
      raw: { slots: Array.isArray(ai?.slots) ? ai!.slots : [] }, taken,
    }).map((s) => ({ ...s, source: "week_plan" as const }));
    for (const s of slots) taken.push({ platform: s.platform, ms: Date.parse(s.scheduled_at) });
    out.push({ slot_index: i, slots });
  }
  return out;
}
