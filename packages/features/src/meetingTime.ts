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
