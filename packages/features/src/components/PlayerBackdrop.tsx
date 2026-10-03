import React, { useEffect, useState } from 'react';

// Full-screen photo backdrop for the prayer / devotional players.
//
// The photos are large CDN images that can take a few seconds on mobile data.
// Painting them as a plain CSS background left the player transparent until
// the download finished, so the page underneath showed through. Instead this
// paints a solid dark base immediately, fades the photo in once it has loaded,
// and warms the cache for the photos the player will show next.

const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();

/** Start downloading an image (once) so a later slide can show it instantly. */
export function preloadImage(src: string): Promise<void> {
  if (!src || loaded.has(src)) return Promise.resolve();
  const existing = pending.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { loaded.add(src); pending.delete(src); resolve(); };
    img.onerror = () => { pending.delete(src); resolve(); };
    img.src = src;
  });
  pending.set(src, p);
  return p;
}

interface Props {
  src: string;
  /** Photos to fetch in the background for upcoming slides. */
  preload?: string[];
}

export const PlayerBackdrop: React.FC<Props> = ({ src, preload }) => {
  const [shown, setShown] = useState(() => (loaded.has(src) ? src : ''));

  useEffect(() => {
    if (loaded.has(src)) { setShown(src); return; }
    let cancelled = false;
    preloadImage(src).then(() => { if (!cancelled && loaded.has(src)) setShown(src); });
    return () => { cancelled = true; };
  }, [src]);

  const preloadKey = (preload || []).join('|');
  useEffect(() => {
    // Only after the current photo is in, so the next one doesn't compete for bandwidth.
    if (shown !== src) return;
    (preload || []).forEach((u) => { void preloadImage(u); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, src, preloadKey]);

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950" aria-hidden="true">
      {shown && (
        <div
          key={shown}
          className="absolute inset-0 animate-in fade-in duration-500"
          style={{ backgroundImage: `url(${shown})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      )}
    </div>
  );
};
