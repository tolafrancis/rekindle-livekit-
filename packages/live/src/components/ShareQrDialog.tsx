import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { toast } from '@rekindle/ui/use-toast';
import { generateQrPngDataUrl, generateBroadcastOverlayPng, downloadUrl } from '@rekindle/features/qrCode';
import { Cast, Copy, Download, Loader2, Maximize2, Share2, X } from 'lucide-react';

interface ShareQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The listener link the QR code opens. */
  url: string;
  /** e.g. "Follow Sunday Service in your language" — dialog title, share
   *  sheet title and the caption on the full-screen view. */
  title: string;
  /** File name stem for downloads, e.g. "sunday-service". */
  fileBase: string;
}

/**
 * Listener-link QR code (2026-10-31): shown on screen first instead of
 * downloading straight away, with Share (phone share sheet, the QR image
 * itself where the browser can share files), Copy link, Download, the OBS
 * broadcast overlay, and a full-screen view a speaker can hold up or
 * project for the room to scan.
 */
export const ShareQrDialog: React.FC<ShareQrDialogProps> = ({ open, onOpenChange, url, title, fileBase }) => {
  const [qr, setQr] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [busy, setBusy] = useState<'share' | 'overlay' | null>(null);
  const safeBase = fileBase.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'listener';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    generateQrPngDataUrl(url, 800).then((png) => { if (!cancelled) setQr(png); });
    return () => { cancelled = true; };
  }, [url, open]);

  // Esc closes the full-screen view, like the dialog itself.
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullScreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullScreen]);

  const copyLink = () => {
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'Link copied' }),
      () => toast({ title: 'Could not copy link', description: url, variant: 'destructive' }),
    );
  };

  // Shares the QR image along with the link where the browser can share
  // files (most phones), else just the link; desktop browsers without the
  // share sheet fall back to copying.
  const share = async () => {
    if (!navigator.share) { copyLink(); return; }
    setBusy('share');
    try {
      let files: File[] | undefined;
      if (qr) {
        const blob = await (await fetch(qr)).blob();
        const file = new File([blob], `${safeBase}-qr.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) files = [file];
      }
      await navigator.share({ title, text: title, url, ...(files ? { files } : {}) });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast({ title: 'Could not share', description: err?.message, variant: 'destructive' });
      }
    } finally {
      setBusy(null);
    }
  };

  const downloadQr = () => {
    if (qr) downloadUrl(qr, `${safeBase}-qr.png`);
  };

  const downloadOverlay = async () => {
    setBusy('overlay');
    try {
      downloadUrl(await generateBroadcastOverlayPng(url), `${safeBase}-broadcast-qr.png`);
      toast({ title: 'Broadcast overlay downloaded', description: 'Drop it into OBS as an image source.' });
    } catch (err: any) {
      toast({ title: 'Could not make the overlay', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {/* Hidden, not closed, while full screen is up: callers often unmount
          this component on close, which would take the full-screen view
          with it. Closing full screen brings the dialog back. */}
      <Dialog open={open && !fullScreen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Scan with a phone camera to open the live translation.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-60 w-60 items-center justify-center rounded-lg border bg-white p-2">
              {qr ? <img src={qr} alt={`QR code for ${url}`} className="h-full w-full" /> : <Loader2 className="h-6 w-6 animate-spin text-slate-400" />}
            </div>
            <code className="w-full break-all rounded bg-muted px-2 py-1.5 text-center text-xs">{url}</code>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button onClick={share} disabled={busy === 'share'}>
                {busy === 'share' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Share2 className="mr-1.5 h-4 w-4" />}
                Share
              </Button>
              <Button variant="outline" onClick={() => setFullScreen(true)}>
                <Maximize2 className="mr-1.5 h-4 w-4" /> Full screen
              </Button>
              <Button variant="outline" onClick={copyLink}>
                <Copy className="mr-1.5 h-4 w-4" /> Copy link
              </Button>
              <Button variant="outline" onClick={downloadQr} disabled={!qr}>
                <Download className="mr-1.5 h-4 w-4" /> Download
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={downloadOverlay} disabled={busy === 'overlay'}>
              {busy === 'overlay' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Cast className="mr-1.5 h-3.5 w-3.5" />}
              Download broadcast overlay (OBS)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {open && fullScreen && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6 bg-white p-6 text-slate-900"
          role="dialog"
          aria-label={title}
          onClick={() => setFullScreen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
            onClick={() => setFullScreen(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="text-center text-2xl font-semibold sm:text-4xl">{title}</p>
          {qr && <img src={qr} alt={`QR code for ${url}`} className="aspect-square w-[min(80vw,70vh)]" />}
          <p className="text-center text-base text-slate-500 sm:text-xl">Scan with your phone camera</p>
        </div>,
        document.body,
      )}
    </>
  );
};

export default ShareQrDialog;
