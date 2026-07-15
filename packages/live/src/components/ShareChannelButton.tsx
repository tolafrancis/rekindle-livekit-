import React, { useState } from 'react';
import { Button } from '@rekindle/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@rekindle/ui/dropdown-menu';
import { Share2, Copy, Check, Send } from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { buildChannelShareText } from '@rekindle/features/liveShare';
import { LiveChannel } from '@rekindle/types/liveChannelTypes';

interface ShareChannelButtonProps {
  channel: LiveChannel;
  /** 'icon' = compact overlay icon (used on channel cards);
   *  'button' = labelled outline button (used in the viewer header). */
  variant?: 'icon' | 'button';
  /** Extra classes for the trigger button (positioning / colours). */
  triggerClassName?: string;
  align?: 'start' | 'end' | 'center';
}

/**
 * Channel share control that mirrors the Books share workflow: a dropdown with
 * WhatsApp / Facebook / X / Email / Copy Link. Radix portals the menu to <body>,
 * so it is never clipped by a card's `overflow-hidden` (the previous native-share
 * fallback just silently copied on desktop, which read as "not working").
 */
export const ShareChannelButton: React.FC<ShareChannelButtonProps> = ({
  channel,
  variant = 'button',
  triggerClassName = '',
  align = 'end',
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/channels/${channel.id}`;
  const isLive = (channel as any).is_live;
  const shareInput = {
    channelName: channel.name,
    description: channel.description,
    isLive,
    url: shareUrl,
  };
  const fullText = buildChannelShareText(shareInput, true); // branded message incl. URL
  const header = isLive
    ? `🔴 ${channel.name} is LIVE on Rekindle`
    : `📡 ${channel.name} on Rekindle`;

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(fullText)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(header)}&url=${encodeURIComponent(shareUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(header)}&body=${encodeURIComponent(fullText)}`,
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    toast({
      title: t('liveChannelCard', 'linkCopied', 'Link Copied!'),
      description: t('liveChannelCard', 'channelLinkCopied', 'Channel link copied to clipboard'),
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            onPointerDown={stop}
            onClick={stop}
            className={triggerClassName}
            aria-label={t('liveChannelCard', 'share', 'Share')}
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onPointerDown={stop}
            onClick={stop}
            className={triggerClassName}
          >
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
            {copied
              ? t('liveChannelViewer', 'copiedButton', 'Copied!')
              : t('liveChannelViewer', 'share', 'Share')}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56" onClick={stop}>
        <DropdownMenuItem asChild>
          <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500"><Send className="h-4 w-4 text-white" /></span>
            WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">f</span>
            Facebook
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={shareLinks.x} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-sm font-bold text-white">𝕏</span>
            X (Twitter)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={shareLinks.email} className="cursor-pointer gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500"><Send className="h-4 w-4 text-white" /></span>
            Email
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500">
            {copied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4 text-white" />}
          </span>
          {copied ? t('liveChannelCard', 'copied', 'Copied!') : t('liveChannelCard', 'copyLink', 'Copy Link')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
