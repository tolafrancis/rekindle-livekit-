import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Code2, Copy, Loader2, Plus, Trash2, KeyRound, ExternalLink } from 'lucide-react';

interface ApiKeySummary {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  requestCount: number;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Self-serve management of Interactive Meetings API keys (Profile → Developer).
 * Any signed-in user — not just ministries — can mint a key here and use it
 * against the public `meetings-api` function to create/run meetings from their
 * own third-party integration. See docs/api/interactive-meetings.md.
 */
export const DeveloperApiKeysPanel: React.FC = () => {
  const { t } = useLanguage();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // Shown once right after creation — never persisted or refetchable.
  const [mintedKey, setMintedKey] = useState<{ key: string; label: string } | null>(null);

  const loadKeys = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('developer-api-keys', { body: { action: 'list' } });
      if (error) throw error;
      setKeys(data?.keys ?? []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast({
        title: t('developerApiKeys', 'loadFailedTitle', 'Could not load API keys'),
        description: t('developerApiKeys', 'loadFailedDesc', 'Please try again in a moment.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('developer-api-keys', {
        body: { action: 'create', label: newLabel.trim() || undefined },
      });
      if (error) throw error;
      setMintedKey({ key: data.key, label: data.label });
      setNewLabel('');
      await loadKeys();
    } catch (error: any) {
      toast({
        title: t('developerApiKeys', 'createFailedTitle', 'Could not create key'),
        description: error?.message || t('developerApiKeys', 'createFailedDesc', 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      const { error } = await supabase.functions.invoke('developer-api-keys', { body: { action: 'revoke', id } });
      if (error) throw error;
      toast({ title: t('developerApiKeys', 'revokedTitle', 'Key revoked') });
      await loadKeys();
    } catch (error: any) {
      toast({
        title: t('developerApiKeys', 'revokeFailedTitle', 'Could not revoke key'),
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast({ title: t('developerApiKeys', 'copiedTitle', 'Copied to clipboard') });
    } catch {
      toast({ title: t('developerApiKeys', 'copyFailedTitle', 'Copy failed'), description: key });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-purple-600" />
            {t('developerApiKeys', 'title', 'Interactive Meetings API')}
          </CardTitle>
          <CardDescription>
            {t('developerApiKeys', 'description', 'Create meetings and mint join links from your own app or server — not limited to ReKindle ministries. See the ')}
            <a
              href="https://rekindlebc.com/docs/api/interactive-meetings"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-purple-600 hover:underline"
            >
              {t('developerApiKeys', 'docsLinkLabel', 'API docs')}
              <ExternalLink className="h-3 w-3" />
            </a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t('developerApiKeys', 'labelPlaceholder', 'e.g. My website integration')}
              className="flex-1"
            />
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {t('developerApiKeys', 'createKey', 'Create Key')}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              {t('developerApiKeys', 'noKeys', 'No API keys yet. Create one to start integrating.')}
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="font-medium text-sm truncate">{k.label}</span>
                      {k.revokedAt && (
                        <span className="text-[10px] uppercase tracking-wide text-red-500 bg-red-50 rounded px-1.5 py-0.5">
                          {t('developerApiKeys', 'revokedBadge', 'Revoked')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono truncate">{k.keyPrefix}…</p>
                    <p className="text-xs text-gray-400">
                      {t('developerApiKeys', 'requestsLabel', '{count} requests').replace('{count}', String(k.requestCount))}
                      {k.lastUsedAt ? ` · ${t('developerApiKeys', 'lastUsedLabel', 'last used')} ${new Date(k.lastUsedAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-red-600 shrink-0"
                      onClick={() => handleRevoke(k.id)}
                      disabled={revokingId === k.id}
                      title={t('developerApiKeys', 'revokeKey', 'Revoke key')}
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

      {/* Shown exactly once — the plaintext key is never retrievable again. */}
      <Dialog open={!!mintedKey} onOpenChange={(open) => { if (!open) setMintedKey(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('developerApiKeys', 'keyCreatedTitle', 'API key created')}</DialogTitle>
            <DialogDescription>
              {t('developerApiKeys', 'keyCreatedDesc', 'Copy this key now — for your security, it won’t be shown again.')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <code className="text-sm font-mono break-all flex-1">{mintedKey?.key}</code>
            <Button size="icon" variant="ghost" onClick={() => mintedKey && copyKey(mintedKey.key)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setMintedKey(null)}>{t('developerApiKeys', 'done', 'Done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DeveloperApiKeysPanel;
