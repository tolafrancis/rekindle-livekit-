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
import { nativePlatform } from '../platform';

const CONFIRM_WORD = 'DELETE';

class AppleConfirmCancelled extends Error {}

// Apple requires deleting an account to also revoke its Sign in with Apple
// tokens. Supabase keeps no Apple token, so on iOS an Apple-linked user
// confirms with Apple once more; the delete-account function swaps that fresh
// code for a token and revokes it. Anywhere else there is nothing to send.
async function appleRevocationBody(user: any): Promise<Record<string, string>> {
  const providers: string[] = user?.app_metadata?.providers ?? [];
  if (nativePlatform() !== 'ios' || !providers.includes('apple')) return {};
  try {
    const [{ FirebaseAuthentication }, { App }] = await Promise.all([
      import('@capacitor-firebase/authentication'),
      import('@capacitor/app'),
    ]);
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
    const code = result.credential?.authorizationCode;
    if (!code) return {};
    return { appleAuthorizationCode: code, appleClientId: (await App.getInfo()).id };
  } catch (err) {
    if (/cancel/i.test(err instanceof Error ? err.message : '')) throw new AppleConfirmCancelled();
    // Apple unavailable: still delete the account, just without the revoke.
    console.warn('[DeleteAccount] Apple confirmation failed:', err);
    return {};
  }
}

/**
 * Settings → Delete account. Apple requires in-app account deletion; this
 * calls the delete-account edge function, which cancels any subscription,
 * refuses ministry owners, and deletes the user. Shared by the consumer app
 * (ProfileSettings → Privacy) and the ministry app (MemberAccountSettings).
 */
export const DeleteAccountSection: React.FC<{ className?: string }> = ({ className }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const body = await appleRevocationBody(user);
      const { data, error } = await supabase.functions.invoke('delete-account', { body });
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
        description: err instanceof AppleConfirmCancelled
          ? 'Confirm with Apple to delete your account.'
          : err instanceof Error ? err.message : 'Please try again.',
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
