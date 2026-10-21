import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { toast } from '@rekindle/ui/use-toast';
import { Download, Link2, Loader2, Share2, Copy } from 'lucide-react';
import { canNativeShare } from '../webShare';
import { isNativeApp } from '../platform';
import { renderShareCard, shareCardText, type ShareCardContent } from '../shareCard';

// Share a declaration or affirmation as a Rekindle-branded image, with a link
// back to it. The image is drawn when the dialog opens so the Share button can
// hand it to the phone's share sheet straight from the tap.

interface ShareCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: ShareCardContent | null;
}

const fileName = (c: ShareCardContent) =>
  `rekindle-${(c.title || c.kind.replace(/s$/, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'share'}.png`;

export const ShareCardDialog: React.FC<ShareCardDialogProps> = ({ open, onOpenChange, content }) => {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !content) return;
    let active = true;
    let url: string | null = null;
    setBlob(null);
    setPreview(null);
    setFailed(false);
    renderShareCard(content)
      .then((b) => {
        if (!active) return;
        url = URL.createObjectURL(b);
        setBlob(b);
        setPreview(url);
      })
      .catch((err) => {
        console.warn('[ShareCardDialog] render failed:', err);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, content]);

  if (!content) return null;

  const file = blob ? new File([blob], fileName(content), { type: 'image/png' }) : null;
  const canShareImage = !!file && canNativeShare()
    && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  // A blob download goes nowhere inside the Android app's web view.
  const canDownload = !!preview && !isNativeApp();

  const shareImage = async () => {
    if (!file) return;
    try {
      await navigator.share({
        files: [file],
        title: content.title || content.label,
        text: `${content.title ? `"${content.title}" ` : ''}Read it on Rekindle: ${content.url}`,
      });
      onOpenChange(false);
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') console.warn('[ShareCardDialog] share failed:', err);
    }
  };

  const shareText = async () => {
    const text = shareCardText(content);
    if (canNativeShare()) {
      try {
        await navigator.share({ title: content.title || content.label, text });
      } catch { /* dismissed */ }
      return;
    }
    await navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard!', description: 'Paste it anywhere to share.' });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(content.url);
    toast({ title: 'Link copied', description: 'It opens this on Rekindle.' });
  };

  const download = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview;
    a.download = fileName(content);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share this {content.kind === 'declarations' ? 'declaration' : 'affirmation'}</DialogTitle>
          <DialogDescription>
            Send it as an image. The link and QR code on it open it on Rekindle.
          </DialogDescription>
        </DialogHeader>

        <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-lg border bg-gray-50">
          {preview ? (
            <img src={preview} alt={`${content.label}: ${content.title || ''}`} className="h-full w-full object-contain" />
          ) : failed ? (
            <p className="px-6 text-center text-sm text-gray-500">We couldn't make the image. You can still share the text and link.</p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
          )}
        </div>

        <div className="grid gap-2">
          {canShareImage && (
            <Button onClick={shareImage} className="w-full bg-purple-600 text-white hover:bg-purple-700">
              <Share2 className="mr-2 h-4 w-4" /> Share image
            </Button>
          )}
          {canDownload && (
            <Button onClick={download} variant={canShareImage ? 'outline' : 'default'} className={canShareImage ? 'w-full' : 'w-full bg-purple-600 text-white hover:bg-purple-700'}>
              <Download className="mr-2 h-4 w-4" /> Save image
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={copyLink} variant="outline">
              <Link2 className="mr-2 h-4 w-4" /> Copy link
            </Button>
            <Button onClick={shareText} variant="outline">
              {canNativeShare() ? <Share2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} Share text
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareCardDialog;
