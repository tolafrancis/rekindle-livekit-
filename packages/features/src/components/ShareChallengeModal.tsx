import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Facebook, MessageCircle, Copy, Check, Share2, Send } from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';
import { canNativeShare } from '../webShare';
import { useLanguage } from '../LanguageContext';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  challengeId: string;
}

export const ShareChallengeModal: React.FC<Props> = ({ open, onClose, title, description, challengeId }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/challenge/${challengeId}`;
  const shareText = `Join me in the "${title}" prayer challenge! ${description}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: t('shareChallengeModal', 'linkCopied', 'Link Copied!'), description: t('shareChallengeModal', 'linkCopiedDesc', 'Share link copied to clipboard') });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`, '_blank');
  };

  const shareToWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`, '_blank');
  };

  const shareToTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer');
  };

  const nativeShare = async () => {
    if (canNativeShare()) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
      } catch (err) {
        console.log('Share cancelled');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-purple-600" />
            {t('shareChallengeModal', 'shareChallenge', 'Share Challenge')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900">{title}</h3>
            <p className="text-sm text-purple-700 mt-1 line-clamp-2">{description}</p>
          </div>

          <div className="flex items-center gap-2">
            <Input value={shareUrl} readOnly className="flex-1 text-sm" />
            <Button variant="outline" size="icon" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button onClick={shareToFacebook} className="bg-[#1877F2] hover:bg-[#166FE5]">
              <Facebook className="h-5 w-5 mr-2" />
              Facebook
            </Button>
            <Button onClick={shareToWhatsApp} className="bg-[#25D366] hover:bg-[#20BD5A]">
              <MessageCircle className="h-5 w-5 mr-2" />
              WhatsApp
            </Button>
            <Button onClick={shareToTelegram} variant="outline" className="border-[#0088cc] text-[#0088cc]">
              <Send className="h-5 w-5 mr-2" />
              Telegram
            </Button>
            {canNativeShare() && (
              <Button onClick={nativeShare} variant="outline">
                <Share2 className="h-5 w-5 mr-2" />
                {t('shareChallengeModal', 'more', 'More')}
              </Button>
            )}
          </div>

          <p className="text-xs text-center text-gray-500">
            {t('shareChallengeModal', 'inviteFriends', 'Invite friends to join this prayer challenge and grow together in faith')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
