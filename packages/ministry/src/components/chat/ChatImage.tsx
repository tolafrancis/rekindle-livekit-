import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@rekindle/ui/dialog';
import { ImageOff, Loader2 } from 'lucide-react';
import { signedChatImageUrl } from '../../lib/groupChatImages';

/**
 * A photo in the chat. Shows the stored thumbnail through a short-lived
 * signed link (or the local preview while it uploads) and opens the larger
 * copy full screen on tap.
 */
export const ChatImage: React.FC<{
  path: string | null;
  previewUrl?: string | null;
  width?: number | null;
  height?: number | null;
  alt: string;
}> = ({ path, previewUrl, width, height, alt }) => {
  const [thumb, setThumb] = useState<string | null>(previewUrl || null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<string | null>(null);

  useEffect(() => {
    if (previewUrl) { setThumb(previewUrl); return; }
    if (!path) return;
    let cancelled = false;
    signedChatImageUrl(path, 'thumb').then((url) => {
      if (cancelled) return;
      if (url) setThumb(url); else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [path, previewUrl]);

  useEffect(() => {
    if (!open || full || !path) return;
    let cancelled = false;
    signedChatImageUrl(path, 'full').then((url) => { if (!cancelled) setFull(url || thumb); });
    return () => { cancelled = true; };
  }, [open, full, path, thumb]);

  // Reserve the photo's shape so the list doesn't jump when it loads.
  const ratio = width && height ? Math.min(Math.max(height / width, 0.4), 1.6) : 0.75;
  const boxStyle: React.CSSProperties = { width: 'min(240px, 60vw)', aspectRatio: `${1} / ${ratio}` };

  if (failed) {
    return (
      <div style={boxStyle} className="flex flex-col items-center justify-center gap-1 rounded-lg bg-muted text-xs text-muted-foreground">
        <ImageOff className="h-5 w-5" />
        Photo unavailable
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => thumb && setOpen(true)}
        style={boxStyle}
        className="block overflow-hidden rounded-lg bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open photo"
      >
        {thumb ? (
          <img src={thumb} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span className="flex h-full w-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] border-0 bg-black p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="flex max-h-[85vh] min-h-[200px] items-center justify-center">
            {full ? (
              <img src={full} alt={alt} className="max-h-[85vh] w-auto max-w-full object-contain" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
