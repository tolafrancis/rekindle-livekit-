// Branded devotional share message + share behaviour.
//
// One source of truth for the text produced when a user taps "Share" on a
// devotional, so mobile (Web Share API) and the web fallback dialog stay in
// sync. The devotional URL is embedded in the message body so that share
// targets which ignore a separate `url` field (SMS, X, some email clients)
// still deliver the link — giving consistent results across Android, iOS,
// WhatsApp, Telegram, Messenger, Email, X, etc.

import { canNativeShare } from './webShare';

export interface DevotionalShareInput {
  /** Ministry name. When missing we fall back to "Rekindle Devotional". */
  ministryName?: string | null;
  /** Devotional title. */
  title?: string | null;
  /** Public deep-link URL to the devotional. */
  url: string;
}

/** Header line: `🙏 <Ministry> Devotional`, or `🙏 Rekindle Devotional`. */
export function buildShareHeader(ministryName?: string | null): string {
  const name = (ministryName || '').trim();
  return name ? `🙏 ${name} Devotional` : '🙏 Rekindle Devotional';
}

/** The call-to-action body shared for every devotional. */
const CTA_LINE =
  'Listen or read today’s devotional on the Rekindle Devotional Player and kickstart your day with God’s Word.';

/**
 * The full, social-optimised share message:
 *
 *   🙏 <Ministry> Devotional
 *
 *   📖 Today's Devotional: "<Title>"
 *
 *   Listen or read today's devotional on the Rekindle Devotional Player and
 *   kickstart your day with God's Word.
 *
 *   🔗 <url>
 *
 * Pass `includeUrl: false` for share targets that accept the link in a
 * separate field (Facebook, Telegram, X) to avoid a duplicated URL.
 */
export function buildDevotionalShareText(
  { ministryName, title, url }: DevotionalShareInput,
  includeUrl = true,
): string {
  const cleanTitle = (title || '').trim() || "Today's Devotional";
  const lines = [
    buildShareHeader(ministryName),
    '',
    `📖 Today's Devotional: "${cleanTitle}"`,
    '',
    CTA_LINE,
  ];
  if (includeUrl) {
    lines.push('', `🔗 ${url}`);
  }
  return lines.join('\n');
}

export interface ShareResult {
  method: 'native' | 'clipboard' | 'none';
}

/**
 * Share a devotional. Uses the native share sheet when available (mobile),
 * otherwise copies the full branded message to the clipboard so the caller can
 * surface a "Link copied" toast. Never throws — a cancelled share resolves to
 * `{ method: 'none' }`.
 */
export async function shareDevotional(input: DevotionalShareInput): Promise<ShareResult> {
  const header = buildShareHeader(input.ministryName);
  const text = buildDevotionalShareText(input);
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;

  // Only use the native sheet on mobile/touch — on desktop it opens a blank
  // OS "Share" panel that spins then vanishes (see canNativeShare).
  if (canNativeShare()) {
    try {
      // The message body already contains the URL; we intentionally do NOT pass
      // a separate `url` so targets don't append it a second time. `title` is
      // the short header used by share sheets that show one.
      await nav.share({ title: header, text });
      return { method: 'native' };
    } catch {
      // User dismissed the sheet or the target rejected — treat as handled.
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
