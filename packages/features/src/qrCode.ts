// QR code + slug + invite-code helpers for the ministry registration system.
// Uses the `qrcode` npm package (client-side, zero external API).
import QRCode from 'qrcode';

/** URL-friendly slug from a ministry name. Caller is responsible for uniqueness. */
export const slugify = (name: string): string => {
  const base = (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'ministry';
};

/**
 * The join URL encoded in the QR / invite link.
 * The app uses react-router BrowserRouter. Both apps/ministry and apps/rekindle
 * register /join/:slug AND /register/:slug pointing at the same
 * MinistryJoinLanding component (the older comment here about /join/:param
 * being taken by a legacy room-join route no longer applies — that route was
 * since removed). /join/ is the canonical form shown in the UI
 * (MinistryRegistrationSettings' "Join link address" field); /register/
 * is kept live so links/QR codes already printed or shared before this
 * change keep working.
 * (Static hosting needs an index.html rewrite for deep links — see DEPLOYMENT note.)
 */
export const buildJoinUrl = (
  slug: string,
  code: string,
  version: number,
  origin?: string,
): string => {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const params = new URLSearchParams();
  if (code) params.set('code', code);
  if (version) params.set('v', String(version));
  const qs = params.toString();
  return `${base}/join/${slug}${qs ? `?${qs}` : ''}`;
};

/** PNG data URL — for on-screen preview and standard mobile-camera scanning. */
export const generateQrPngDataUrl = (text: string, size = 600): Promise<string> =>
  QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });

/** Vector SVG string — print-quality (bulletins, banners, pull-up stands). */
export const generateQrSvgString = (text: string): Promise<string> =>
  QRCode.toString(text, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });

/**
 * ReKindle Live Translation — broadcast companion overlay. Live broadcasts
 * (YouTube, OBS, the ReKindle BC broadcast player) don't support picking
 * between multiple audio tracks, so multilingual audiences instead scan a
 * QR shown on-screen to open the /display self-select landing page on
 * their own phone. This composites that QR + instruction text into one
 * transparent-background PNG an AV engineer can drop straight into OBS as
 * a picture-in-picture / lower-third element — no compositing on their end.
 *
 * Canvas, not SVG: needs to be a flat raster image for OBS's media-source
 * import, and the semi-transparent card only matters as *pixels* (a true
 * SVG would still need rasterizing before OBS could use it as a static
 * overlay). Alpha channel is preserved outside the rounded card so it
 * composites cleanly over any footage rather than showing a hard rectangle.
 */
export interface BroadcastOverlayOptions {
  /** e.g. "Follow in your language" */
  title?: string;
  /** e.g. "Scan with your phone camera" */
  subtitle?: string;
  qrSize?: number;
  /** Print the literal URL as a fallback for anyone who can't/won't scan
   *  (someone typing it in manually, or reading it off a screenshot).
   *  Default true. Font auto-shrinks to fit the card — service/session
   *  URLs carry a UUID and can be long. */
  showUrl?: boolean;
}

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** PNG data URL, ready for <img src> preview or downloadUrl(). Browser-only (canvas). */
export const generateBroadcastOverlayPng = async (
  url: string,
  {
    title = 'Follow in your language',
    subtitle = 'Scan with your phone camera',
    qrSize = 260,
    showUrl = true,
  }: BroadcastOverlayOptions = {},
): Promise<string> => {
  const qrDataUrl = await generateQrPngDataUrl(url, qrSize);
  const qrImg = await loadImage(qrDataUrl);

  const pad = 24;
  const qrBoxSize = qrSize + pad; // white backdrop behind the QR itself — keeps it scannable over any footage
  const width = qrBoxSize + pad * 3 + 420;
  const height = qrBoxSize + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Card — the only opaque region; everything outside stays transparent.
  roundRectPath(ctx, 0, 0, width, height, 20);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'; // slate-900 — see HlsPlayer/TranslationDisplayPage for the same dark theme
  ctx.fill();

  // White backdrop behind the QR so it scans cleanly regardless of what's under the overlay.
  const qrBoxX = pad;
  const qrBoxY = (height - qrBoxSize) / 2;
  roundRectPath(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.drawImage(qrImg, qrBoxX + pad / 2, qrBoxY + pad / 2, qrSize, qrSize);

  // Text block. Title height depends on how many lines it wraps to (e.g.
  // "Follow in your language" wraps to 2 at this card width) — that used to
  // be computed independently of the subtitle's fixed Y, so a wrapped title
  // could land its second line right on top of the subtitle (real bug,
  // caught visually on a live-generated overlay). Measure the wrap first,
  // then vertically center title+subtitle as one block so the subtitle's
  // position always accounts for however many lines the title actually took.
  const textX = qrBoxX + qrBoxSize + pad;
  const maxTextWidth = width - textX - pad;
  const titleLineHeight = 46;
  const subtitleLineHeight = 30;
  const titleSubtitleGap = 18;
  const urlLineHeight = 20;
  const subtitleUrlGap = 10;

  ctx.font = 'bold 40px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textBaseline = 'alphabetic';
  const titleLines = wrapLines(ctx, title, maxTextWidth);

  // URLs (service/session links carry a UUID) can run long — shrink the font
  // to fit the card's text column in one line rather than wrapping mid-UUID
  // or overflowing the card. Monospace so it's actually legible/typeable if
  // someone reads it off a screenshot rather than scanning.
  const urlFont = showUrl ? fitMonospaceFont(ctx, url, maxTextWidth, 16, 11) : null;

  const blockHeight =
    titleLines.length * titleLineHeight +
    titleSubtitleGap +
    subtitleLineHeight +
    (showUrl ? subtitleUrlGap + urlLineHeight : 0);
  let lineY = (height - blockHeight) / 2 + titleLineHeight * 0.72; // 0.72 ≈ cap-height offset from a fillText baseline

  ctx.font = 'bold 40px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillStyle = '#ffffff';
  titleLines.forEach((line, i) => {
    ctx.fillText(line, textX, lineY);
    if (i < titleLines.length - 1) lineY += titleLineHeight;
  });

  lineY += titleSubtitleGap + subtitleLineHeight * 0.7;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.font = '24px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(subtitle, textX, lineY);

  if (showUrl && urlFont) {
    lineY += subtitleUrlGap + urlLineHeight * 0.75;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = urlFont;
    ctx.fillText(url, textX, lineY);
  }

  return canvas.toDataURL('image/png');
};

/** Shrinks a monospace font size (from `startPx` down to `minPx`) until `text`
 *  fits within `maxWidth` on one line. Returns the chosen font string — does
 *  NOT set it on `ctx` itself, callers set it right before drawing. */
function fitMonospaceFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number): string {
  for (let size = startPx; size > minPx; size -= 1) {
    const font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return font;
  }
  return `${minPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
}

/** Simple greedy word-wrap — the qrcode npm package has no text layout of its own. Returns
 *  the wrapped lines without drawing them, so the caller can measure the block's total
 *  height before committing to a vertical position (see the overlap bug note above). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Trigger a browser download for a data/object URL. */
export const downloadUrl = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** Trigger a browser download for raw text (e.g. an SVG string). */
export const downloadTextFile = (content: string, filename: string, mime = 'image/svg+xml') => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Short, human-readable invite code (no ambiguous characters). */
export const generateInviteCode = (len = 8): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
};

/** SHA-256 hex — used to store the kiosk PIN and device tokens hashed at rest. */
export const sha256Hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
