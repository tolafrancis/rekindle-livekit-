// Timezone helpers for scheduled meetings.
//
// A scheduled meeting stores a real UTC instant (scheduled_time, timestamptz) plus
// the IANA zone the host picked (timezone). The host types a wall-clock time in a
// <input type="datetime-local"> (which is zone-less), so we convert that wall time
// *in the chosen zone* to a UTC instant on save, and convert back for editing.
// Everyone then sees the same moment rendered in the meeting's zone with its label.

/** How many milliseconds `timeZone` is ahead of UTC at the given instant. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = map.hour;
  if (hour === '24') hour = '00'; // some engines render midnight as 24
  const asUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(hour), Number(map.minute), Number(map.second),
  );
  return asUTC - at.getTime();
}

/**
 * Convert a zone-less wall time ("YYYY-MM-DDTHH:mm" from datetime-local) interpreted
 * in `timeZone` into a UTC ISO string. DST-correct: the offset is measured at the
 * resulting instant.
 */
export function zonedWallTimeToUtcISO(localDateTime: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localDateTime || '');
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  // Offset near the target instant; one correction pass is exact outside the
  // ~1h/year DST-transition ambiguity, which meetings can tolerate.
  const offset = tzOffsetMs(timeZone, new Date(utcGuess));
  return new Date(utcGuess - offset).toISOString();
}

/**
 * Inverse of the above: turn a stored UTC instant into the "YYYY-MM-DDTHH:mm" wall
 * time in `timeZone`, for prefilling a datetime-local input when editing.
 */
export function utcISOToZonedInputValue(utcISO: string, timeZone: string): string {
  const at = new Date(utcISO);
  if (isNaN(at.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = map.hour;
  if (hour === '24') hour = '00';
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

/** Human label for a stored instant rendered in the meeting's zone (e.g. "Jul 25, 2026, 2:00 PM EDT"). */
export function formatMeetingTime(utcISO: string | null, timeZone?: string | null): string {
  if (!utcISO) return '';
  const at = new Date(utcISO);
  if (isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timeZone || undefined,
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZoneName: 'short',
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
  }
}

/** The viewer's own IANA zone, defaulting the create form (falls back to UTC). */
export function guessUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * A compact, curated list of common IANA zones for the picker, always including the
 * viewer's own zone at the top so it's the obvious default. Grouped loosely by region.
 */
export function commonTimeZones(): { value: string; label: string }[] {
  const base = [
    'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
    'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi', 'Africa/Cairo',
    'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
    'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
    'Australia/Sydney', 'Pacific/Auckland', 'UTC',
  ];
  const own = guessUserTimeZone();
  const ordered = [own, ...base.filter((z) => z !== own)];
  // Dedup while preserving order.
  const seen = new Set<string>();
  return ordered
    .filter((z) => (seen.has(z) ? false : (seen.add(z), true)))
    .map((z) => ({ value: z, label: labelForZone(z) }));
}

/** "Africa/Lagos" → "Africa/Lagos (GMT+1)" for readability in the dropdown. */
function labelForZone(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, timeZoneName: 'shortOffset', hour: '2-digit',
    }).formatToParts(new Date());
    const off = parts.find((p) => p.type === 'timeZoneName')?.value;
    const pretty = zone.replace(/_/g, ' ');
    return off ? `${pretty} (${off})` : pretty;
  } catch {
    return zone.replace(/_/g, ' ');
  }
}

/** Reminder-offset options the host can toggle per meeting (minutes before start). */
export const REMINDER_OFFSET_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 1440, label: '1 day before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 15, label: '15 minutes before' },
];

/* ------------------------------------------------------------------
   Recurring meetings (2026-11-01)

   A recurring meeting is ONE ministry_video_meetings row: same room, same
   link, same registrations and recordings list, every time. scheduled_time
   holds the first (or current) occurrence; recurrence_pattern (jsonb) says how
   it repeats. Occurrences step in the meeting's own zone, so "Sundays 9:00 AM
   Lagos" stays 9:00 AM across DST changes. The process-meeting-reminders cron
   rolls scheduled_time forward once an occurrence is over (it keeps a copy of
   nextMeetingOccurrence — keep the two in sync), and the UI also computes the
   next occurrence itself so it never shows a stale past time in between.
------------------------------------------------------------------- */

export type MeetingRecurrenceFrequency = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';

export interface MeetingRecurrencePattern {
  frequency: MeetingRecurrenceFrequency;
  /** Last day (YYYY-MM-DD, in the meeting's zone) an occurrence may fall on. Omit for no end. */
  until?: string | null;
}

export const MEETING_RECURRENCE_OPTIONS: { value: MeetingRecurrenceFrequency; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
];

const RECURRENCE_FREQUENCIES = new Set<string>(MEETING_RECURRENCE_OPTIONS.map((o) => o.value));

/** Parse whatever is stored in recurrence_pattern (jsonb, or a legacy plain string). */
export function parseMeetingRecurrence(raw: unknown): MeetingRecurrencePattern | null {
  if (!raw) return null;
  let v: any = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = { frequency: v }; }
  }
  if (typeof v !== 'object' || !v || !RECURRENCE_FREQUENCIES.has(v.frequency)) return null;
  const until = typeof v.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.until) ? v.until : null;
  return { frequency: v.frequency, until };
}

/** Step a zone-less wall time ("YYYY-MM-DDTHH:mm") to the next occurrence. */
function stepWallTime(wall: string, freq: MeetingRecurrenceFrequency, anchorDay: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall);
  if (!m) return wall;
  const [, y, mo, d, h, mi] = m.map(Number);
  let next: Date;
  if (freq === 'monthly') {
    // Same day-of-month as the first occurrence, clamped to short months (31st → 30th/28th).
    const target = new Date(Date.UTC(y, mo, 1, h, mi)); // first of next month
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(anchorDay, lastDay));
    next = target;
  } else {
    const days = freq === 'weekly' ? 7 : freq === 'biweekly' ? 14 : 1;
    next = new Date(Date.UTC(y, mo - 1, d + days, h, mi));
    if (freq === 'weekdays') {
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next = new Date(next.getTime() + 86400000);
    }
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(next.getUTCHours())}:${pad(next.getUTCMinutes())}`;
}

/**
 * The occurrence a recurring meeting should show/start next: the first one
 * (from scheduled_time onward) that hasn't finished yet at `nowMs`. Returns
 * scheduled_time unchanged when it's not recurring or still upcoming/in
 * progress, and null when the series has run past its end date.
 */
export function nextMeetingOccurrence(
  scheduledISO: string | null | undefined,
  timeZone: string | null | undefined,
  pattern: unknown,
  durationMinutes: number | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!scheduledISO) return null;
  const rule = parseMeetingRecurrence(pattern);
  const durMs = Math.max(1, durationMinutes || 60) * 60000;
  const startMs = new Date(scheduledISO).getTime();
  if (isNaN(startMs)) return null;
  if (!rule || startMs + durMs > nowMs) return scheduledISO;

  const tz = timeZone || 'UTC';
  let wall = utcISOToZonedInputValue(scheduledISO, tz);
  const anchorDay = Number(wall.slice(8, 10));
  for (let i = 0; i < 4000; i++) {
    wall = stepWallTime(wall, rule.frequency, anchorDay);
    if (rule.until && wall.slice(0, 10) > rule.until) return null;
    const iso = zonedWallTimeToUtcISO(wall, tz);
    if (!iso) return null;
    if (new Date(iso).getTime() + durMs > nowMs) return iso;
  }
  return null;
}

/** "Every week" / "Every week until Dec 20, 2026" for a meeting card. */
export function describeMeetingRecurrence(pattern: unknown): string {
  const rule = parseMeetingRecurrence(pattern);
  if (!rule) return '';
  const base = MEETING_RECURRENCE_OPTIONS.find((o) => o.value === rule.frequency)?.label ?? '';
  if (!rule.until) return base;
  const [y, mo, d] = rule.until.split('-').map(Number);
  const untilLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, mo - 1, d)));
  return `${base} until ${untilLabel}`;
}
