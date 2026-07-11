// Recording retention policy — how long a recording stays available to watch /
// download before the daily cleanup job auto-deletes it.
//
//   • Interactive meetings (private, member-facing): 30 days
//   • Live broadcasts / sermons (public, evergreen):  90 days
//
// These numbers drive the "Available until …" badge in the UI. NOTE: the old
// Mux `cleanup-recordings` job was removed with Mux — server-side auto-deletion of
// LiveKit Egress recordings (livekit_recordings + object storage) still needs a
// LiveKit-native cleanup job wired to these same windows.

export const RECORDING_RETENTION_DAYS = {
  meeting: 30,
  broadcast: 90,
} as const;

export type RecordingKind = keyof typeof RECORDING_RETENTION_DAYS;

/** Recordings within this many days of expiry are flagged "expiring soon". */
export const RETENTION_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;

export function retentionDays(kind: RecordingKind): number {
  return RECORDING_RETENTION_DAYS[kind];
}

/** The date a recording will be auto-deleted, from its creation time + kind. */
export function recordingExpiry(createdIso: string, kind: RecordingKind): Date {
  return new Date(new Date(createdIso).getTime() + retentionDays(kind) * DAY_MS);
}

export interface ExpiryInfo {
  expiresAt: Date;
  /** Whole days remaining (ceil); negative once past expiry. */
  daysLeft: number;
  expired: boolean;
  /** Within RETENTION_WARNING_DAYS of expiry. */
  soon: boolean;
  /** Human label, e.g. "Available until 4 Aug 2026" / "Expires in 2 days". */
  label: string;
}

export function recordingExpiryInfo(
  createdIso: string,
  kind: RecordingKind,
  now: number = Date.now(),
): ExpiryInfo {
  const expiresAt = recordingExpiry(createdIso, kind);
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
  return { expiresAt, daysLeft, expired, soon, label };
}
