// Recording retention policy — how long a recording stays available to watch /
// download before the daily cleanup job (supabase/functions/ministry-retention-sweep)
// auto-deletes it. These are the FREE/bundled-tier defaults that sweep enforces
// (MEETING_RETENTION_DAYS / BROADCAST_RETENTION_DAYS there) — keep them in sync.
//
//   • Interactive meetings (private, member-facing): 7 days
//   • Live broadcasts / sermons (public, evergreen):  30 days
//
// Ministries with an active storage_pack add-on can override this with their
// own recording_retention_days (including "never") — this constant is only the
// fallback used when no such override applies (pass one via recordingExpiryInfo's
// overrideDays param: a number to override the window, or null for "never").

export const RECORDING_RETENTION_DAYS = {
  meeting: 7,
  broadcast: 30,
} as const;

export type RecordingKind = keyof typeof RECORDING_RETENTION_DAYS;

/** Recordings within this many days of expiry are flagged "expiring soon". */
export const RETENTION_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;

export function retentionDays(kind: RecordingKind): number {
  return RECORDING_RETENTION_DAYS[kind];
}

/** The date a recording will be auto-deleted, from its creation time + kind
 *  (or an explicit override day-count, for a storage_pack ministry's custom
 *  retention setting). */
export function recordingExpiry(createdIso: string, kind: RecordingKind, overrideDays?: number): Date {
  const days = overrideDays ?? retentionDays(kind);
  return new Date(new Date(createdIso).getTime() + days * DAY_MS);
}

export interface ExpiryInfo {
  /** null when the recording is kept indefinitely (neverExpires). */
  expiresAt: Date | null;
  /** Whole days remaining (ceil); negative once past expiry; null if neverExpires. */
  daysLeft: number | null;
  expired: boolean;
  /** Within RETENTION_WARNING_DAYS of expiry. */
  soon: boolean;
  /** True for a storage_pack ministry that set retention to "Never delete". */
  neverExpires: boolean;
  /** Human label, e.g. "Available until 4 Aug 2026" / "Expires in 2 days" / "Kept indefinitely". */
  label: string;
}

/**
 * @param overrideDays A storage_pack ministry's custom recording_retention_days:
 *   omit/undefined to use the kind's fixed default, a number to use that many
 *   days instead, or `null` for "Never delete" (neverExpires: true).
 */
export function recordingExpiryInfo(
  createdIso: string,
  kind: RecordingKind,
  now: number = Date.now(),
  overrideDays?: number | null,
): ExpiryInfo {
  if (overrideDays === null) {
    return { expiresAt: null, daysLeft: null, expired: false, soon: false, neverExpires: true, label: 'Kept indefinitely' };
  }
  const expiresAt = recordingExpiry(createdIso, kind, overrideDays);
  const msLeft = expiresAt.getTime() - now;
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  const expired = msLeft <= 0;
  const soon = !expired && daysLeft <= RETENTION_WARNING_DAYS;
  const dateStr = expiresAt.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const label = expired
    ? 'Expired'
    : soon
      ? (daysLeft <= 1 ? 'Expires today' : `Expires in ${daysLeft} days`)
      : `Available until ${dateStr}`;
  return { expiresAt, daysLeft, expired, soon, neverExpires: false, label };
}
