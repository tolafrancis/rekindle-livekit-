import { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@rekindle/ui/dialog';
import { toast } from '@rekindle/ui/use-toast';
import { Copy, KeyRound, Loader2, LogOut, Plus, Trash2, Zap } from 'lucide-react';

interface ApiKeySummary {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  requestCount: number;
  revokedAt: string | null;
  createdAt: string;
}

interface Account {
  plan: string;
  companyName: string | null;
  monthlyMinutesUsed: number;
  monthlyMinutesLimit: number;
  billingEnabled: boolean;
  monthlyParticipantMinutes: number;
  estimatedCostUsd: number;
}

// Minutes -> a trimmed hours string (e.g. 90 -> "1.5", 600 -> "10").
const formatHours = (minutes: number): string => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
};

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [mintedKey, setMintedKey] = useState<{ key: string; label: string } | null>(null);
  const [enablingBilling, setEnablingBilling] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const [{ data: acct, error: acctErr }, { data: keyData, error: keyErr }] = await Promise.all([
        supabase.functions.invoke('developer-api-keys', { body: { action: 'account' } }),
        supabase.functions.invoke('developer-api-keys', { body: { action: 'list' } }),
      ]);
      if (acctErr) throw acctErr;
      if (keyErr) throw keyErr;
      setAccount(acct);
      setKeys(keyData?.keys ?? []);
    } catch (error: any) {
      toast({ title: 'Could not load your account', description: error?.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Landed back here from enable-billing's Stripe Checkout redirect —
    // the webhook that actually flips plan/billingEnabled may land a few
    // seconds after Stripe redirects the browser, so this is optimistic
    // (a reload a few seconds later would show it enabled); it just
    // confirms the checkout itself went through.
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (billing === 'success') {
      toast({ title: 'Pay-as-you-go enabled', description: 'It may take a few seconds to show as active below.' });
    } else if (billing === 'cancelled') {
      toast({ title: 'Checkout cancelled', description: 'You’re still on the free plan.' });
    }
    if (billing) window.history.replaceState({}, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('developer-api-keys', {
        body: { action: 'create', label: newLabel.trim() || undefined },
      });
      if (error) throw error;
      setMintedKey({ key: data.key, label: data.label });
      setNewLabel('');
      await load();
    } catch (error: any) {
      toast({ title: 'Could not create key', description: error?.message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      const { error } = await supabase.functions.invoke('developer-api-keys', { body: { action: 'revoke', id } });
      if (error) throw error;
      toast({ title: 'Key revoked' });
      await load();
    } catch (error: any) {
      toast({ title: 'Could not revoke key', description: error?.message, variant: 'destructive' });
    } finally {
      setRevokingId(null);
    }
  };

  const handleEnableBilling = async () => {
    setEnablingBilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('developer-api-keys', {
        body: { action: 'enable-billing', back: window.location.href.split('?')[0] },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (error: any) {
      toast({ title: 'Could not start checkout', description: error?.message, variant: 'destructive' });
      setEnablingBilling(false);
    }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', description: key });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4">
          <span className="font-semibold text-lg">Interactive Meetings API</span>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl py-10 px-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>{account?.companyName || 'Free plan'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="flex items-center gap-6 text-sm flex-wrap">
                  <div>
                    <p className="text-muted-foreground">Plan</p>
                    <p className="font-medium capitalize">
                      {account?.plan === 'pay_as_you_go' ? 'Pay-as-you-go' : 'Free'}
                    </p>
                  </div>
                  {account?.plan === 'pay_as_you_go' ? (
                    <>
                      <div>
                        <p className="text-muted-foreground">Participant-minutes this month</p>
                        <p className="font-medium">{Math.round(account.monthlyParticipantMinutes)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Estimated cost this month</p>
                        <p className="font-medium">${account.estimatedCostUsd.toFixed(2)}</p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-muted-foreground">Hours used this month</p>
                      <p className="font-medium">{formatHours(account?.monthlyMinutesUsed ?? 0)} / {formatHours(account?.monthlyMinutesLimit ?? 600)} hrs</p>
                    </div>
                  )}
                </div>

                {account && !account.billingEnabled && (
                  <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm">
                      <p className="font-medium">Need more than the free 10 hrs/month?</p>
                      <p className="text-muted-foreground">
                        Pay-as-you-go has no monthly fee — you're only billed for participant-minutes past the free
                        allotment (~$0.0035/participant-minute). No caps on meeting size, length, or how many run at once.
                      </p>
                    </div>
                    <Button size="sm" onClick={handleEnableBilling} disabled={enablingBilling}>
                      {enablingBilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                      Enable pay-as-you-go
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Use a key with{' '}
              <a href="https://github.com/rekindlebc/docs/blob/main/docs/api/interactive-meetings.md" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                the Interactive Meetings API
              </a>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Production server" className="flex-1" />
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Key
              </Button>
            </div>

            {isLoading ? null : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No API keys yet. Create one to get started.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{k.label}</span>
                        {k.revokedAt && (
                          <span className="text-[10px] uppercase tracking-wide text-destructive bg-destructive/10 rounded px-1.5 py-0.5">Revoked</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate">{k.keyPrefix}…</p>
                      <p className="text-xs text-muted-foreground">
                        {k.requestCount} requests
                        {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    {!k.revokedAt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRevoke(k.id)}
                        disabled={revokingId === k.id}
                        title="Revoke key"
                      >
                        {revokingId === k.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!mintedKey} onOpenChange={(open) => { if (!open) setMintedKey(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>Copy this key now — for your security, it won't be shown again.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2">
            <code className="text-sm font-mono break-all flex-1">{mintedKey?.key}</code>
            <Button size="icon" variant="ghost" onClick={() => mintedKey && copyKey(mintedKey.key)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setMintedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
