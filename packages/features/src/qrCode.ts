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
 * The app uses react-router BrowserRouter. NOTE: /join/:param is taken by the legacy
 * room-join route, so the ministry registration path is /register/:slug.
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
  return `${base}/register/${slug}${qs ? `?${qs}` : ''}`;
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
