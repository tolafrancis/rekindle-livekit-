import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { toast } from '@rekindle/ui/use-toast';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@rekindle/ui/alert-dialog';
import { useAuth } from '../AuthContext';

const CONFIRM_WORD = 'DELETE';

/**
 * Settings → Delete account. Apple requires in-app account deletion; this
 * calls the delete-account edge function, which cancels any subscription,
 * refuses ministry owners, and deletes the user. Shared by the consumer app
 * (ProfileSettings → Privacy) and the ministry app (MemberAccountSettings).
 */
export const DeleteAccountSection: React.FC<{ className?: string }> = ({ className }) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) {
        // Non-2xx: the function's JSON body carries the reason.
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error || error.message);
      }
      if (!data?.success) throw new Error(data?.error || 'Please try again.');

      setOpen(false);
      toast({ title: 'Account deleted', description: 'Your account and personal data have been removed.' });
      await signOut();
      navigate('/', { replace: true });
    } catch (err) {
      toast({
        title: 'Could not delete account',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={className}>
      <div className="rounded-lg border border-red-200 p-4 space-y-3">
        <div>
          <p className="font-medium text-red-700">Delete account</p>
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and personal data. Any active subscription is cancelled.
            This cannot be undone.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => { setConfirmText(''); setOpen(true); }}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete my account
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(o) => { if (!deleting) setOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your profile, prayers, progress, messages and other personal data will be permanently
              deleted, and any active subscription will be cancelled. If you own a ministry, transfer
              or close it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-account-confirm">Type {CONFIRM_WORD} to confirm</Label>
            <Input
              id="delete-account-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              disabled={deleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
