// Friendly share text for live meetings, live broadcasts (channels) and events.
//
// Mirrors src/lib/devotionalShare.ts: one branded, social-optimised message with
// the URL embedded in the body (so targets that drop a separate `url` field —
// SMS, X, some email clients — still deliver the link), plus a native-share sheet
// on mobile and a clipboard fallback on desktop (see canNativeShare).

import { canNativeShare } from './webShare';

export interface ShareResult {
  method: 'native' | 'clipboard' | 'none';
}

/**
 * Canonical public origin for share links whose landing page / room lives in the
 * consumer app (e.g. interactive-meeting join links). The interactive-meeting
 * join page + room exist only in the consumer app, so a link built from the
 * standalone ministry app's own origin would dead-end. The ministry app sets
 * VITE_PUBLIC_APP_URL to the consumer origin (e.g. https://app.rekindlebc.com);
 * the consumer app leaves it unset and falls back to its own origin. Channel
 * WATCH links intentionally do NOT use this — /channels/:id is self-contained in
 * both apps, preserving white-label for live broadcasts.
 */
export function publicAppOrigin(): string {
  const u = (import.meta as any)?.env?.VITE_PUBLIC_APP_URL;
  if (typeof u === 'string' && u.trim()) return u.trim().replace(/\/+$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** Format an ISO timestamp for share text, e.g. "Sat, 5 Jul, 6:00 PM". */
function formatWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Like formatWhen but rendered IN the meeting's zone and labelled with it, e.g.
 * "Sat, Jul 25, 9:00 PM · Asia/Bangkok (GMT+7)" — so a shared link reads correctly
 * whatever zone the recipient is in.
 */
function formatWhenTz(iso?: string | null, tz?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dateStr = d.toLocaleString(undefined, {
    timeZone: tz || undefined,
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
  if (!tz) return dateStr;
  let offset = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset', hour: '2-digit' }).formatToParts(d);
    offset = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch { /* invalid tz → omit offset */ }
  return offset ? `${dateStr} · ${tz} (${offset})` : `${dateStr} · ${tz}`;
}

// ── Native-or-clipboard share (shared by all three builders) ────────────────
async function nativeOrCopy(title: string, text: string): Promise<ShareResult> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  if (canNativeShare()) {
    try {
      await nav.share({ title, text });
      return { method: 'native' };
    } catch {
      return { method: 'none' };
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return { method: 'clipboard' };
    } catch {
      return { method: 'none' };
    }
  }
  return { method: 'none' };
}

// ── Live meeting (interactive video meeting / webinar) ──────────────────────
export interface MeetingShareInput {
  /** Owning ministry or channel name. Falls back to "Rekindle" when absent. */
  hostName?: string | null;
  title?: string | null;
  scheduledTime?: string | null;
  /** IANA zone the meeting was scheduled in — shown next to the time. */
  timezone?: string | null;
  /** When true, a scheduled meeting invites people to register (not just view). */
  registrationEnabled?: boolean;
  url: string;
}

export function buildMeetingShareText(
  { hostName, title, scheduledTime, timezone, registrationEnabled, url }: MeetingShareInput,
  includeUrl = true,
): string {
  const host = (hostName || '').trim();
  const header = host ? `🎥 ${host} Live Meeting` : '🎥 Rekindle Live Meeting';
  const cleanTitle = (title || '').trim() || 'Live Meeting';
  const when = formatWhenTz(scheduledTime, timezone);
  const lines = [header, '', `📌 "${cleanTitle}"`];
  if (when) lines.push(`🗓 ${when}`);
  lines.push('');
  if (when) {
    // Scheduled meeting: the link opens a details/registration page, not the room.
    lines.push(registrationEnabled
      ? 'Tap the link to register and get a reminder before it starts.'
      : 'Tap the link for the meeting details and to join when it starts.');
  } else {
    lines.push('Join us live on Rekindle — tap the link to enter the meeting room.');
  }
  if (includeUrl) lines.push('', `🔗 ${url}`);
  return lines.join('\n');
}

export function shareMeeting(input: MeetingShareInput): Promise<ShareResult> {
  const host = (input.hostName || '').trim();
  const header = host ? `🎥 ${host} Live Meeting` : '🎥 Rekindle Live Meeting';
  return nativeOrCopy(header, buildMeetingShareText(input));
}

// ── Live broadcast / channel ────────────────────────────────────────────────
export interface ChannelShareInput {
  channelName?: string | null;
  description?: string | null;
  /** True when the channel is currently live — tweaks the wording. */
  isLive?: boolean;
  url: string;
}

export function buildChannelShareText(
  { channelName, description, isLive, url }: ChannelShareInput,
  includeUrl = true,
): string {
  const name = (channelName || '').trim() || 'Rekindle';
  const header = isLive ? `🔴 ${name} is LIVE on Rekindle` : `📡 ${name} on Rekindle`;
  const lines = [header];
  const desc = (description || '').trim();
  if (desc) lines.push('', desc);
  lines.push('', isLive
    ? 'Tune in now and worship together on Rekindle.'
    : 'Follow the channel and catch every live broadcast on Rekindle.');
  if (includeUrl) lines.push('', `🔗 ${url}`);
  return lines.join('\n');
}

export function shareChannel(input: ChannelShareInput): Promise<ShareResult> {
  const name = (input.channelName || '').trim() || 'Rekindle';
  const header = input.isLive ? `🔴 ${name} is LIVE on Rekindle` : `📡 ${name} on Rekindle`;
  return nativeOrCopy(header, buildChannelShareText(input));
}

// ── Live channel event ──────────────────────────────────────────────────────
export interface EventShareInput {
  title?: string | null;
  channelName?: string | null;
  description?: string | null;
  scheduledTime?: string | null;
  url: string;
}

export function buildEventShareText(
  { title, channelName, description, scheduledTime, url }: EventShareInput,
  includeUrl = true,
): string {
  const cleanTitle = (title || '').trim() || 'Live Event';
  const name = (channelName || '').trim();
  const header = name ? `📅 ${cleanTitle} — ${name} on Rekindle` : `📅 ${cleanTitle} on Rekindle`;
  const when = formatWhen(scheduledTime);
  const lines = [header];
  const desc = (description || '').trim();
  if (desc) lines.push('', desc);
  if (when) lines.push('', `🗓 ${when}`);
  lines.push('', 'Join us live on Rekindle.');
  if (includeUrl) lines.push('', `🔗 ${url}`);
  return lines.join('\n');
}

export function shareEvent(input: EventShareInput): Promise<ShareResult> {
  const cleanTitle = (input.title || '').trim() || 'Live Event';
  const name = (input.channelName || '').trim();
  const header = name ? `📅 ${cleanTitle} — ${name} on Rekindle` : `📅 ${cleanTitle} on Rekindle`;
  return nativeOrCopy(header, buildEventShareText(input));
}
