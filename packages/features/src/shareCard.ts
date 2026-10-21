// Branded share image for declarations and affirmations: the words on a
// Rekindle card (logo, title, text, Scripture) with a link and QR code back to
// the item, so whoever receives it can read it on Rekindle. Drawn on a canvas
// in the browser; no server round trip.
import QRCode from 'qrcode';

export type ShareCardKind = 'declarations' | 'affirmations';

export interface ShareCardContent {
  kind: ShareCardKind;
  label: string;          // e.g. "Daily Declaration"
  title?: string | null;
  text: string;
  scripture?: string | null;
  category?: string | null;
  url: string;            // where the QR code and footer point
  sharedBy?: string;      // ministry name, when shared from a ministry space
}

const CONSUMER_APP_URL = (import.meta.env.VITE_CONSUMER_APP_URL || 'https://app.rekindlebc.com').replace(/\/+$/, '');

/**
 * Public link to the item on Rekindle. Ministry-owned items are members-only,
 * and the built-in fallback has no row, so those link to Rekindle itself.
 */
export function shareCardUrl(kind: ShareCardKind, item: { id: string; ministry_id?: string | null }): string {
  if (!item.id || item.id === 'default' || item.ministry_id) return CONSUMER_APP_URL;
  return `${CONSUMER_APP_URL}/${kind}/${encodeURIComponent(item.id)}`;
}

/** The plain-text version for copying or for share targets that drop images. */
export function shareCardText(c: ShareCardContent): string {
  const title = c.title ? `${c.title}\n\n` : '';
  const ref = c.scripture ? `\n\n— ${c.scripture}` : '';
  return `${title}${c.text.trim()}${ref}\n\nRead it on Rekindle: ${c.url}`;
}

// Same palettes as the cards' Tailwind gradients (from-*-600 to-*-800).
const GRADIENTS: Record<string, [string, string]> = {
  protection: ['#4f46e5', '#3730a3'],
  victory: ['#059669', '#166534'],
  prosperity: ['#f59e0b', '#a16207'],
  health: ['#f43f5e', '#be185d'],
  authority: ['#7c3aed', '#6b21a8'],
  breakthrough: ['#0891b2', '#1d4ed8'],
  faith: ['#2563eb', '#1e40af'],
  wisdom: ['#4f46e5', '#6d28d9'],
  identity: ['#9333ea', '#6b21a8'],
  family: ['#f97316', '#e11d48'],
  love: ['#ef4444', '#be123c'],
  purpose: ['#0d9488', '#047857'],
  strength: ['#f97316', '#b91c1c'],
  peace: ['#16a34a', '#047857'],
  provision: ['#f59e0b', '#a16207'],
  healing: ['#0891b2', '#0f766e'],
};
const DEFAULT_GRADIENT: [string, string] = ['#7c3aed', '#4c1d95'];

const W = 1080;
const H = 1350;
const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const SANS = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

async function ensureFonts() {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  try {
    await Promise.all([
      fonts.load(`700 56px "Cormorant Garamond"`),
      fonts.load(`600 40px "Cormorant Garamond"`),
      fonts.load(`italic 600 34px "Cormorant Garamond"`),
      fonts.load(`500 28px "DM Sans"`),
    ]);
  } catch {
    /* fall back to Georgia / system fonts */
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Block { lines: string[]; font: string; lineHeight: number; color: string; gapAfter: number; align: CanvasTextAlign }

/** Lay the title, paragraphs and Scripture out at the largest size that fits. */
function layoutBody(ctx: CanvasRenderingContext2D, c: ShareCardContent, width: number, height: number) {
  const paragraphs = c.text.split('\n').map((p) => p.trim()).filter(Boolean);
  for (let size = 46; size >= 24; size -= 2) {
    const blocks: Block[] = [];
    if (c.title) {
      const font = `700 ${Math.round(size * 1.35)}px ${SERIF}`;
      ctx.font = font;
      blocks.push({ lines: wrap(ctx, c.title, width), font, lineHeight: size * 1.5, color: '#1f2937', gapAfter: size * 0.8, align: 'center' });
    }
    const bodyFont = `500 ${size}px ${SERIF}`;
    ctx.font = bodyFont;
    paragraphs.forEach((p) => {
      blocks.push({ lines: wrap(ctx, p, width), font: bodyFont, lineHeight: size * 1.4, color: '#1f2937', gapAfter: size * 0.6, align: 'left' });
    });
    if (c.scripture) {
      const font = `italic 600 ${Math.max(size - 4, 24)}px ${SERIF}`;
      ctx.font = font;
      blocks.push({ lines: wrap(ctx, `— ${c.scripture}`, width), font, lineHeight: size * 1.4, color: '#b45309', gapAfter: 0, align: 'left' });
    }
    const total = blocks.reduce((h, b) => h + b.lines.length * b.lineHeight + b.gapAfter, 0);
    if (total <= height || size === 24) return { blocks, total, size };
  }
  throw new Error('unreachable');
}

/** Render the share card as a PNG. */
export async function renderShareCard(c: ShareCardContent): Promise<Blob> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  // Background: the card's category gradient with a soft glow.
  const [from, to] = GRADIENTS[c.category || ''] || DEFAULT_GRADIENT;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, from);
  bg.addColorStop(1, to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 120, 0, W * 0.85, 120, 600);
  glow.addColorStop(0, 'rgba(255,255,255,0.18)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const [logo, qr] = await Promise.all([
    loadImage('/icon-192.png'),
    QRCode.toDataURL(c.url, { margin: 1, width: 300, color: { dark: '#3b0764', light: '#ffffff' } })
      .then(loadImage)
      .catch(() => null),
  ]);

  // Header: logo, wordmark and the item label.
  const M = 72;
  let x = M;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(M + 40, 104, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    ctx.drawImage(logo, M + 4, 68, 72, 72);
    ctx.restore();
    x = M + 100;
  }
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 56px ${SERIF}`;
  ctx.fillText('Rekindle', x, 100);
  ctx.textAlign = 'right';
  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(c.label.toUpperCase().split('').join(' '), W - M, 104);

  // White card with the words.
  const cardX = M - 16;
  const cardY = 196;
  const cardW = W - 2 * cardX;
  const cardH = 900;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  const pad = 64;
  const innerW = cardW - 2 * pad;
  const innerH = cardH - 2 * pad;
  const { blocks, total } = layoutBody(ctx, c, innerW, innerH);

  // Centre vertically when it fits; otherwise clip and say where to read the rest.
  const overflow = total > innerH;
  let y = cardY + pad + (overflow ? 0 : (innerH - total) / 2);
  const limit = cardY + pad + innerH - (overflow ? 56 : 0);
  ctx.textBaseline = 'top';
  outer: for (const b of blocks) {
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    ctx.textAlign = b.align;
    const bx = b.align === 'center' ? W / 2 : cardX + pad;
    for (let i = 0; i < b.lines.length; i++) {
      if (y + b.lineHeight > limit) break outer;
      ctx.fillText(b.lines[i], bx, y);
      y += b.lineHeight;
    }
    y += b.gapAfter;
  }
  if (overflow) {
    ctx.textAlign = 'center';
    ctx.font = `600 26px ${SANS}`;
    ctx.fillStyle = '#7c3aed';
    ctx.fillText('Continue reading on Rekindle', W / 2, cardY + cardH - pad - 30);
  }

  // Footer: where to read it, plus a QR code.
  const footY = cardY + cardH + 44;
  const qrSize = 170;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${SERIF}`;
  ctx.fillText(c.kind === 'declarations' ? 'Declare it daily on Rekindle' : 'Read more on Rekindle', M, footY + 6);
  ctx.font = `500 26px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(c.url.replace(/^https?:\/\//, ''), M, footY + 66, W - 2 * M - qrSize - 32);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(c.sharedBy ? `Shared from ${c.sharedBy}` : 'Devotionals · Prayer · Declarations', M, footY + 108, W - 2 * M - qrSize - 32);
  if (qr) {
    const qx = W - M - qrSize;
    const qy = footY - 6;
    roundRect(ctx, qx - 10, qy - 10, qrSize + 20, qrSize + 20, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(qr, qx, qy, qrSize, qrSize);
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'),
  );
}
