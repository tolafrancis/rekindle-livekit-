import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { PrayerGroup } from '@rekindle/types/prayerTypes';
import { Facebook, MessageCircle, Copy, Check, Share2, Users } from 'lucide-react';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  open: boolean;
  onClose: () => void;
  group: PrayerGroup;
}

export const ShareGroupModal: React.FC<Props> = ({ open, onClose, group }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/group/${group.id}`;
  const shareText = `Join "${group.name}" prayer group! ${group.description || 'Come pray with us!'}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: t('shareGroupModal', 'linkCopied', 'Link Copied!'), description: t('shareGroupModal', 'shareLinkCopiedDesc', 'Share link copied to clipboard') });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`, '_blank');
  };

  const shareToWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`, '_blank');
  };

  const shareToMessenger = () => {
    window.open(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(shareUrl)}&app_id=YOUR_APP_ID&redirect_uri=${encodeURIComponent(window.location.origin)}`, '_blank');
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, text: shareText, url: shareUrl });
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
            {t('shareGroupModal', 'sharePrayerGroup', 'Share Prayer Group')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-900">{group.name}</h3>
                <p className="text-sm text-purple-700">{t('shareGroupModal', 'membersCount', '{count} members').replace('{count}', String(group.member_count))}</p>
              </div>
            </div>
            {group.description && (
              <p className="text-sm text-purple-700 mt-2 line-clamp-2">{group.description}</p>
            )}
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
            <Button onClick={shareToMessenger} variant="outline" className="border-[#0084FF] text-[#0084FF]">
              <MessageCircle className="h-5 w-5 mr-2" />
              Messenger
            </Button>
            {navigator.share && (
              <Button onClick={nativeShare} variant="outline">
                <Share2 className="h-5 w-5 mr-2" />
                {t('shareGroupModal', 'more', 'More')}
              </Button>
            )}
          </div>

          <p className="text-xs text-center text-gray-500">
            {t('shareGroupModal', 'inviteFriendsHint', 'Invite friends to join this prayer group and grow in faith together')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
