import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from './ui/use-toast';
import { Facebook, MessageCircle, Link2, Check, Share2, Send, Mail, MessageSquare } from 'lucide-react';
import { buildDevotionalShareText, buildShareHeader, shareDevotional } from '@/lib/devotionalShare';
import { canNativeShare } from '@/lib/webShare';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  /** Ministry name for branded share text. Falls back to Rekindle when absent. */
  ministryName?: string | null;
}

export const SocialShareModal: React.FC<Props> = ({
  isOpen, onClose, title, description, url, imageUrl, ministryName
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  // Branded, social-optimised message. `fullMessage` embeds the link (used by
  // targets that only accept free text — WhatsApp, SMS, Email, native share);
  // `messageNoLink` is used where the URL is passed in a dedicated field
  // (Facebook, Telegram, X) to avoid a duplicated link.
  const fullMessage = buildDevotionalShareText({ ministryName, title, url });
  const messageNoLink = buildDevotionalShareText({ ministryName, title, url }, false);
  const header = buildShareHeader(ministryName);

  const encodedFull = encodeURIComponent(fullMessage);
  const encodedNoLink = encodeURIComponent(messageNoLink);
  const encodedUrl = encodeURIComponent(url);
  const encodedHeader = encodeURIComponent(header);

  const openTarget = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

  const shareOptions = [
    {
      name: 'WhatsApp',
      icon: <MessageCircle className="h-6 w-6" />,
      color: 'bg-green-600 hover:bg-green-700',
      onClick: () => openTarget(`https://wa.me/?text=${encodedFull}`),
    },
    {
      name: 'Telegram',
      icon: <Send className="h-6 w-6" />,
      color: 'bg-sky-500 hover:bg-sky-600',
      onClick: () => openTarget(`https://t.me/share/url?url=${encodedUrl}&text=${encodedNoLink}`),
    },
    {
      name: 'Facebook',
      icon: <Facebook className="h-6 w-6" />,
      color: 'bg-blue-600 hover:bg-blue-700',
      onClick: () => openTarget(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedNoLink}`),
    },
    {
      name: 'X',
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      color: 'bg-black hover:bg-gray-800',
      onClick: () => openTarget(`https://twitter.com/intent/tweet?text=${encodedNoLink}&url=${encodedUrl}`),
    },
    {
      name: 'Email',
      icon: <Mail className="h-6 w-6" />,
      color: 'bg-amber-600 hover:bg-amber-700',
      onClick: () => openTarget(`mailto:?subject=${encodedHeader}&body=${encodedFull}`),
    },
    {
      name: 'SMS',
      icon: <MessageSquare className="h-6 w-6" />,
      color: 'bg-purple-600 hover:bg-purple-700',
      onClick: () => openTarget(`sms:?&body=${encodedFull}`),
    },
  ];

  // Native share sheet (mobile only) — reaches Messenger, SMS and every other
  // installed target directly. Hidden on desktop, where the OS share panel opens
  // blank and the web link buttons below are the reliable path.
  const hasNativeShare = canNativeShare();
  const nativeShare = async () => {
    const result = await shareDevotional({ ministryName, title, url });
    if (result.method === 'native') onClose();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullMessage);
      setCopied(true);
      toast({ title: t('socialShareModal', 'copiedTitle', 'Copied to share!'), description: t('socialShareModal', 'copiedDescription', 'The full devotional message is on your clipboard.') });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t('socialShareModal', 'failedToCopy', 'Failed to copy'), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-purple-600" />
            {t('socialShareModal', 'shareDevotional', 'Share Devotional')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            {imageUrl && (
              <img src={imageUrl} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />
            )}
            <h4 className="font-semibold text-gray-900 mb-1">{header}</h4>
            <p className="text-sm text-gray-700 mb-1">
              📖 {t('socialShareModal', 'todaysDevotional', "Today's Devotional")}: “{(title || '').trim() || t('socialShareModal', 'todaysDevotional', "Today's Devotional")}”
            </p>
            {description && (
              <p className="text-sm text-gray-600 line-clamp-2">{description}</p>
            )}
          </div>

          {/* Native share (mobile) — reaches all installed apps */}
          {hasNativeShare && (
            <Button
              onClick={nativeShare}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center justify-center gap-2 py-6"
            >
              <Share2 className="h-5 w-5" />
              <span>{t('socialShareModal', 'shareVia', 'Share via…')}</span>
            </Button>
          )}

          {/* Share buttons */}
          <div className="grid grid-cols-2 gap-3">
            {shareOptions.map((option) => (
              <Button
                key={option.name}
                onClick={option.onClick}
                className={`${option.color} text-white flex items-center justify-center gap-2 py-6`}
              >
                {option.icon}
                <span>{option.name}</span>
              </Button>
            ))}
          </div>

          {/* Copy link */}
          <div className="flex gap-2">
            <Input
              value={url}
              readOnly
              className="flex-1 bg-gray-50"
            />
            <Button
              onClick={copyLink}
              variant={copied ? 'default' : 'outline'}
              className={copied ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
