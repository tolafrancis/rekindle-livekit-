import React, { useState } from 'react';
import { MoreHorizontal, Flag, Ban, UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
import { cn } from '@rekindle/ui/utils';
import { useAuth } from '../AuthContext';
import type { ReportTarget } from '../moderation';
import { ReportContentDialog } from './ReportContentDialog';
import { BlockUserDialog } from './BlockUserDialog';
import { UserProfileSheet } from './UserProfileSheet';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props extends ReportTarget {
  /** Extra items (e.g. an existing Delete) rendered above Report/Block. */
  children?: React.ReactNode;
  className?: string;
  /** Visual size of the ⋯ trigger. */
  size?: 'sm' | 'md';
  /** Hide "Block user" (e.g. for content with no identifiable author). */
  hideBlock?: boolean;
  /** Posted anonymously: no "View profile", so the author isn't revealed. */
  anonymous?: boolean;
  onBlocked?: () => void;
}

/**
 * The ⋯ menu for any piece of user-generated content: View profile (which
 * offers Report user / Block), Report, and Block user.
 * Renders nothing for the viewer's own content (and no Report/Block when
 * signed out), unless `children` adds other items.
 */
export const ContentSafetyMenu: React.FC<Props> = ({
  children,
  className,
  size = 'sm',
  hideBlock,
  anonymous,
  onBlocked,
  ...target
}) => {
  const { user } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const viewerId: string | undefined = user?.id;
  const authorId = target.contentType === 'user' ? String(target.contentId) : target.authorId ?? null;
  const isOwn = !!viewerId && !!authorId && viewerId === authorId;
  const canReport = !!viewerId && !isOwn;
  // Guests in meeting chat have non-uuid ids; there's no account to block.
  const canBlock = canReport && !!authorId && UUID_RE.test(authorId) && !hideBlock;
  const canViewProfile = canBlock && !anonymous && target.contentType !== 'user';

  if (!canReport && !children) return null;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label="More options"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
            className,
          )}
        >
          <MoreHorizontal className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {children}
          {children && canReport && <DropdownMenuSeparator />}
          {canViewProfile && (
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <UserRound className="mr-2 h-4 w-4" />
              View profile
            </DropdownMenuItem>
          )}
          {canReport && (
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag className="mr-2 h-4 w-4" />
              Report
            </DropdownMenuItem>
          )}
          {canBlock && (
            <DropdownMenuItem onSelect={() => setBlockOpen(true)} className="text-destructive focus:text-destructive">
              <Ban className="mr-2 h-4 w-4" />
              Block user
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canReport && <ReportContentDialog open={reportOpen} onOpenChange={setReportOpen} target={target} />}
      {canBlock && authorId && (
        <BlockUserDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          userId={authorId}
          userName={target.authorName}
          onBlocked={onBlocked}
        />
      )}
      {canViewProfile && authorId && (
        <UserProfileSheet
          open={profileOpen}
          onOpenChange={setProfileOpen}
          userId={authorId}
          fallbackName={target.authorName}
          ministryId={target.ministryId}
        />
      )}
    </>
  );
};

export default ContentSafetyMenu;
