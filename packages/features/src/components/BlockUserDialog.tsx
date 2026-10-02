import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@rekindle/ui/alert-dialog';
import { toast } from '@rekindle/ui/use-toast';
import { useModeration } from '../ModerationContext';
import { BLOCK_CONFIRM } from '../moderation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName?: string | null;
  onBlocked?: () => void;
}

export const BlockUserDialog: React.FC<Props> = ({ open, onOpenChange, userId, userName, onBlocked }) => {
  const { block } = useModeration();
  const [busy, setBusy] = useState(false);
  const who = userName?.trim() || 'this user';

  const handleBlock = async (e: React.MouseEvent) => {
    e.preventDefault(); // keep the dialog open until the request finishes
    setBusy(true);
    try {
      await block(userId);
      toast({ title: `Blocked ${who}`, description: 'You can unblock them in Settings → Privacy.' });
      onOpenChange(false);
      onBlocked?.();
    } catch (err) {
      toast({
        title: 'Could not block',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Block {who}?</AlertDialogTitle>
          <AlertDialogDescription>{BLOCK_CONFIRM}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBlock}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? 'Blocking…' : 'Block'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BlockUserDialog;
