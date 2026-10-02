import React, { useEffect, useState } from 'react';
import { Ban, Flag, Loader2, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { Button } from '@rekindle/ui/button';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '../AuthContext';
import { useModeration } from '../ModerationContext';
import { fetchPublicProfile, type PublicProfile } from '../moderation';
import { ReportContentDialog } from './ReportContentDialog';
import { BlockUserDialog } from './BlockUserDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Shown while the profile loads, and if it can't be loaded. */
  fallbackName?: string | null;
  ministryId?: string | null;
}

/**
 * Another user's public profile, with "Report user" and "Block" / "Unblock".
 * The apps have no standalone profile page, so this is opened from the ⋯
 * menu on that person's posts and messages ("View profile").
 */
export const UserProfileSheet: React.FC<Props> = ({ open, onOpenChange, userId, fallbackName, ministryId }) => {
  const { user } = useAuth();
  const { isBlocked, unblock } = useModeration();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchPublicProfile(userId)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, userId]);

  const name = profile?.name || fallbackName?.trim() || 'User';
  const isSelf = user?.id === userId;
  const blocked = isBlocked(userId);

  const handleUnblock = async () => {
    setUnblocking(true);
    try {
      await unblock(userId);
      toast({ title: `Unblocked ${name}` });
    } catch (err) {
      toast({
        title: 'Could not unblock',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUnblocking(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader className="items-center text-center">
            <Avatar className="h-20 w-20">
              {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
              <AvatarFallback className="text-2xl">{name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <DialogTitle className="pt-2">{name}</DialogTitle>
            <DialogDescription>
              {loading ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : profile?.memberSince ? (
                `Member since ${new Date(profile.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
              ) : (
                'Community member'
              )}
            </DialogDescription>
          </DialogHeader>

          {user && !isSelf && (
            <div className="grid gap-2 pt-2">
              <Button variant="outline" onClick={() => setReportOpen(true)}>
                <Flag className="mr-2 h-4 w-4" /> Report user
              </Button>
              {blocked ? (
                <Button variant="outline" onClick={handleUnblock} disabled={unblocking}>
                  <UserCheck className="mr-2 h-4 w-4" /> {unblocking ? 'Unblocking…' : 'Unblock'}
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => setBlockOpen(true)}>
                  <Ban className="mr-2 h-4 w-4" /> Block user
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReportContentDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        target={{ contentType: 'user', contentId: userId, authorId: userId, authorName: name, ministryId }}
      />
      <BlockUserDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        userId={userId}
        userName={name}
        onBlocked={() => onOpenChange(false)}
      />
    </>
  );
};

export default UserProfileSheet;
