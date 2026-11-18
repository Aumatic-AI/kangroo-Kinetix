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
  /** Blog publish times (platform "blog"). Absent on plans made before blogs were scheduled. */
  blog?: PlannedPost[];
}

export const POSTING_HOURS = { earliest: "08:00", latest: "21:30" } as const;
/** Minimum gap between two posts on the SAME platform (spec §4.3: avoid clustering). */
export const MIN_SAME_PLATFORM_GAP_MS = 20 * 3_600_000;

/**
 * The same-platform gap for a given number of posts per platform per week. Up to 7
 * a week, one a day with a 20 h gap. Above 7 (frequencies go up to 14), two posts on
 * some days are unavoidable, so the gap drops to 5 h — still inside posting hours
 * (08:00–21:30), and the second time of day in SECOND_TIME keeps them apart.
 */
export function minSamePlatformGapMs(postsPerWeek: number): number {
  return postsPerWeek > 7 ? 5 * 3_600_000 : MIN_SAME_PLATFORM_GAP_MS;
}

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
  // A blog's one "platform" is its WordPress publish time: weekday late mornings, Tue/Thu first.
  blog: { dayOffsets: [1, 3, 2, 0, 4, 5, 6], time: "10:00" },
};

/** A second default time of day per platform, ≥5 h from the first, for weeks with more than 7 posts. */
const SECOND_TIME: Record<string, string> = { instagram: "12:00", facebook: "18:30", tiktok: "13:00", linkedin: "15:00", blog: "15:00" };

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
  /** Same-platform spacing; default 20 h. See minSamePlatformGapMs. */
  minGapMs?: number;
  /** No slot earlier than this (UTC ms) — e.g. "Generate now" in Live, scheduling in the current week. */
  notBeforeMs?: number;
}): ProposedSlot[] {
  const gap = args.minGapMs ?? MIN_SAME_PLATFORM_GAP_MS;
  const notBefore = args.notBeforeMs ?? -Infinity;
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
    const conflicts = (ms: number) => ms < notBefore || taken.some((t) => t.platform === platform && Math.abs(t.ms - ms) < gap);

    let ms = date && time ? zonedLocalToUtcMs(date, time, tz) : NaN;
    if (Number.isNaN(ms) || conflicts(ms)) {
      adjusted = true;
      // Try the AI's date first (if valid and only the gap conflicted), then fallback days — at the
      // AI's time, then the platform's default time, then its second time of day (only reachable
      // when the gap allows two posts a day). The first free (day, time) wins.
      const candidates = [...(date ? [date] : []), ...fb.dayOffsets.map((o) => weekDates[o]), ...weekDates];
      const times = [...new Set([...(time ? [time] : []), fb.time, SECOND_TIME[platform] ?? "12:00"])];
      let found: { d: string; t: string } | null = null;
      for (const t of times) {
        const d = candidates.find((c) => !conflicts(zonedLocalToUtcMs(c, t, tz)));
        if (d) { found = { d, t }; break; }
      }
      date = found?.d ?? candidates[0];
      time = found?.t ?? fb.time;
      ms = zonedLocalToUtcMs(date, time, tz);
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

/**
 * The 7-day window a creative is scheduled in, as its first date: the cycle's week, or —
 * when that week has already started (Live "Generate now" adds to the current week) — the
 * 7 days from today, so no slot is proposed in the past. `notBeforeMs` keeps today's
 * earlier hours out too.
 */
export function schedulingWindow(weekStart: string, nowMs: number, tz: string): { start: string; notBeforeMs: number } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: isValidTimezone(tz) ? tz : "America/Toronto" }).format(new Date(nowMs));
  return { start: today > weekStart ? today : weekStart, notBeforeMs: nowMs + 30 * 60_000 };
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
  const minGapMs = minSamePlatformGapMs(args.count);
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
      raw: { slots: Array.isArray(ai?.slots) ? ai!.slots : [] }, taken, minGapMs,
    }).map((s) => ({ ...s, source: "week_plan" as const }));
    for (const s of slots) taken.push({ platform: s.platform, ms: Date.parse(s.scheduled_at) });
    out.push({ slot_index: i, slots });
  }
  return out;
}

/**
 * The next weekly run (Friday 18:00 in `tz`, the cron in weeklyContentCycle) after `nowMs`, as UTC ms.
 * Display only — the cron itself is `TZ=America/Toronto 0 18 * * 5`.
 */
export function nextWeeklyRunMs(nowMs: number, tz = "America/Toronto"): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(nowMs));   // YYYY-MM-DD
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;                            // Mon=0 … Fri=4
  for (let add = (4 - dow + 7) % 7; ; add += 7) {
    const at = zonedLocalToUtcMs(addDays(today, add), "18:00", tz);
    if (at > nowMs) return at;
  }
}
