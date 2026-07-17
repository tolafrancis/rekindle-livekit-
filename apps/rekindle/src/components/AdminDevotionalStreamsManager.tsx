// Admin: manage daily-devotional STREAMS (migration 0149) and how each one is
// POPULATED (migration 0161).
//
// A stream is a named feed of the main-app `devotionals`. Admins create streams
// here; each daily devotional is assigned to one in the Devotionals tab. Ministries
// and users then pick a public stream to display. The default "ReKindle BC" stream
// is seeded by the migration and can't be deleted (it's the fallback).
//
// Population mode is per-stream (see docs/devotional-stream-automation-plan.md):
//   Manual  → no devotional_stream_sources row; an admin authors each day (default).
//   AI      → a daily cron generates an original devotional.
//   Scrape  → a daily cron ingests one from a licensed RSS/Atom feed.
// Automated jobs insert DRAFTS (is_published=false) for an admin to approve.

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { toast } from './ui/use-toast';
import {
  Layers, Plus, Edit, Trash2, Loader2, Star, Eye, EyeOff, Save,
  Hand, Sparkles, Rss, Play, AlertTriangle, CheckCircle2,
} from 'lucide-react';

type Mode = 'manual' | 'ai' | 'scrape';

interface StreamSource {
  stream_id: string;
  kind: 'ai' | 'scrape';
  source_url: string | null;
  parser_key: string | null;
  prompt: string | null;
  license_basis: string | null;
  scripture_version: string;
  is_active: boolean;
  last_run_at: string | null;
  last_status: string | null;
}

interface Stream {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  is_default: boolean;
  sort_order: number;
  count?: number;           // devotionals assigned
  source?: StreamSource | null;
}

type Editing = Partial<Stream> & {
  mode?: Mode;
  src_prompt?: string;
  src_source_url?: string;
  src_license_basis?: string;
  src_scripture_version?: string;
  src_is_active?: boolean;
};

const BIBLE_VERSIONS = ['kjv', 'web', 'oeb-us'];

const empty = (): Editing => ({
  name: '', description: '', cover_image_url: '', is_public: true, sort_order: 0,
  mode: 'manual', src_scripture_version: 'kjv', src_is_active: true,
});

export const AdminDevotionalStreamsManager: React.FC = () => {
  const { t } = useLanguage();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: streamRows }, { data: sourceRows }] = await Promise.all([
      supabase.from('devotional_streams').select('*')
        .order('is_default', { ascending: false })
        .order('sort_order', { ascending: true }),
      supabase.from('devotional_stream_sources').select('*'),
    ]);

    const byStream = new Map<string, StreamSource>();
    (sourceRows as StreamSource[] ?? []).forEach((r) => byStream.set(r.stream_id, r));

    // Count devotionals per stream so admins see which feeds actually have content.
    const rows = (streamRows as Stream[]) ?? [];
    await Promise.all(rows.map(async (s) => {
      const { count } = await supabase
        .from('devotionals')
        .select('id', { count: 'exact', head: true })
        .eq('stream_id', s.id);
      s.count = count ?? 0;
      s.source = byStream.get(s.id) ?? null;
    }));
    setStreams(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(empty()); setShowModal(true); };
  const openEdit = (s: Stream) => {
    setEditing({
      ...s,
      mode: (s.source?.kind as Mode) ?? 'manual',
      src_prompt: s.source?.prompt ?? '',
      src_source_url: s.source?.source_url ?? '',
      src_license_basis: s.source?.license_basis ?? '',
      src_scripture_version: s.source?.scripture_version ?? 'kjv',
      src_is_active: s.source?.is_active ?? true,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast({ title: t('adminDevotionalStreams', 'nameRequired', 'Stream name is required'), variant: 'destructive' });
      return;
    }
    const mode: Mode = editing.mode ?? 'manual';
    // Validate the automation config up front — the DB has matching CHECK constraints,
    // and the scrape job refuses to run without a licence basis.
    if (mode === 'ai' && !editing.src_prompt?.trim()) {
      toast({ title: t('adminDevotionalStreams', 'promptRequired', 'A prompt is required for AI streams'), variant: 'destructive' });
      return;
    }
    if (mode === 'scrape') {
      if (!editing.src_source_url?.trim()) {
        toast({ title: t('adminDevotionalStreams', 'feedRequired', 'A feed URL is required for scraped streams'), variant: 'destructive' });
        return;
      }
      if (!editing.src_license_basis?.trim()) {
        toast({ title: t('adminDevotionalStreams', 'licenceRequired', 'A licence basis is required'), description: t('adminDevotionalStreams', 'licenceRequiredDesc', 'Record why this feed may be republished (public domain, or an explicit permission/licence). The job refuses to run without it.'), variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      description: editing.description || null,
      cover_image_url: editing.cover_image_url || null,
      is_public: editing.is_public ?? true,
      sort_order: editing.sort_order ?? 0,
    };

    // Upsert the stream first — a new one needs its id before the source row.
    let streamId = editing.id;
    let error;
    if (streamId) {
      ({ error } = await supabase.from('devotional_streams').update(payload).eq('id', streamId));
    } else {
      const res = await supabase.from('devotional_streams').insert(payload).select('id').single();
      error = res.error;
      streamId = res.data?.id;
    }
    if (error || !streamId) {
      setSaving(false);
      toast({ title: t('adminDevotionalStreams', 'saveFailed', 'Could not save stream'), description: error?.message, variant: 'destructive' });
      return;
    }

    // Population mode: manual = no source row at all.
    let srcError;
    if (mode === 'manual') {
      ({ error: srcError } = await supabase.from('devotional_stream_sources').delete().eq('stream_id', streamId));
    } else {
      ({ error: srcError } = await supabase.from('devotional_stream_sources').upsert({
        stream_id: streamId,
        kind: mode,
        prompt: mode === 'ai' ? editing.src_prompt!.trim() : null,
        source_url: mode === 'scrape' ? editing.src_source_url!.trim() : null,
        parser_key: mode === 'scrape' ? 'rss' : null,
        license_basis: mode === 'scrape' ? editing.src_license_basis!.trim() : null,
        scripture_version: editing.src_scripture_version || 'kjv',
        is_active: editing.src_is_active ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stream_id' }));
    }
    setSaving(false);
    if (srcError) {
      toast({ title: t('adminDevotionalStreams', 'sourceSaveFailed', 'Stream saved, but its population settings failed'), description: srcError.message, variant: 'destructive' });
      return;
    }

    toast({ title: t('adminDevotionalStreams', 'saved', 'Stream saved') });
    setShowModal(false);
    setEditing(null);
    load();
  };

  const remove = async (s: Stream) => {
    if (s.is_default) {
      toast({ title: t('adminDevotionalStreams', 'cannotDeleteDefault', 'The default stream cannot be deleted'), variant: 'destructive' });
      return;
    }
    if (!confirm(t('adminDevotionalStreams', 'confirmDelete', 'Delete this stream? Its devotionals are kept and fall back to the default stream.'))) return;
    const { error } = await supabase.from('devotional_streams').delete().eq('id', s.id);
    if (error) {
      toast({ title: t('adminDevotionalStreams', 'deleteFailed', 'Could not delete stream'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('adminDevotionalStreams', 'deleted', 'Stream deleted') });
    load();
  };

  /** Fire this stream's ingest job once, now — same function the cron calls. */
  const runNow = async (s: Stream) => {
    if (!s.source) return;
    setRunningId(s.id);
    const fn = s.source.kind === 'ai' ? 'ingest-devotional-ai' : 'ingest-devotional-scrape';
    const { data, error } = await supabase.functions.invoke(fn, { body: { streamId: s.id } });
    setRunningId(null);
    if (error) {
      toast({ title: t('adminDevotionalStreams', 'runFailed', 'Run failed'), description: error.message, variant: 'destructive' });
    } else {
      const status = data?.results?.[0]?.status ?? 'ok';
      toast({
        title: String(status).startsWith('error')
          ? t('adminDevotionalStreams', 'runReportedError', 'The job reported an error')
          : t('adminDevotionalStreams', 'runDone', 'Run complete'),
        description: String(status),
        variant: String(status).startsWith('error') ? 'destructive' : undefined,
      });
    }
    load();
  };

  const modeBadge = (s: Stream) => {
    if (!s.source) {
      return <Badge variant="outline" className="text-gray-500"><Hand className="h-3 w-3 mr-1" />{t('adminDevotionalStreams', 'manual', 'Manual')}</Badge>;
    }
    const paused = !s.source.is_active;
    const cls = paused ? 'text-gray-400 border-gray-300' : s.source.kind === 'ai' ? 'text-indigo-600 border-indigo-300' : 'text-teal-600 border-teal-300';
    const Icon = s.source.kind === 'ai' ? Sparkles : Rss;
    const label = s.source.kind === 'ai'
      ? t('adminDevotionalStreams', 'aiMode', 'AI')
      : t('adminDevotionalStreams', 'scrapeMode', 'Feed');
    return (
      <Badge variant="outline" className={cls}>
        <Icon className="h-3 w-3 mr-1" />
        {label}{paused ? ` · ${t('adminDevotionalStreams', 'paused', 'paused')}` : ''}
      </Badge>
    );
  };

  const statusLine = (s: Stream) => {
    if (!s.source?.last_run_at) return null;
    const err = (s.source.last_status ?? '').startsWith('error');
    const when = new Date(s.source.last_run_at).toLocaleString();
    return (
      <span className={`inline-flex items-center gap-1 ${err ? 'text-red-500' : 'text-gray-400'}`}>
        {err ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        {when} · {s.source.last_status}
      </span>
    );
  };

  const mode: Mode = editing?.mode ?? 'manual';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-purple-600" />
          {t('adminDevotionalStreams', 'title', 'Devotional Streams')}
        </CardTitle>
        <Button size="sm" onClick={openNew} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="h-4 w-4 mr-1" />{t('adminDevotionalStreams', 'newStream', 'New Stream')}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">
          {t('adminDevotionalStreams', 'blurb', 'Named feeds of the daily devotional. Assign each devotional to a stream in the Devotionals tab; ministries and users pick a public stream to display. Each stream is filled either manually or automatically — automated entries arrive as drafts for you to approve.')}
        </p>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-2">
            {streams.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                {s.cover_image_url
                  ? <img src={s.cover_image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  : <div className="w-10 h-10 rounded bg-purple-50 flex items-center justify-center shrink-0"><Layers className="h-5 w-5 text-purple-300" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 truncate">{s.name}</p>
                    {s.is_default && <Badge variant="outline" className="text-amber-600 border-amber-300"><Star className="h-3 w-3 mr-1" />{t('adminDevotionalStreams', 'default', 'Default')}</Badge>}
                    {s.is_public
                      ? <Badge variant="outline" className="text-green-600 border-green-300"><Eye className="h-3 w-3 mr-1" />{t('adminDevotionalStreams', 'public', 'Public')}</Badge>
                      : <Badge variant="outline" className="text-gray-500"><EyeOff className="h-3 w-3 mr-1" />{t('adminDevotionalStreams', 'hidden', 'Hidden')}</Badge>}
                    {modeBadge(s)}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {t('adminDevotionalStreams', 'countLabel', '{n} devotionals').replace('{n}', String(s.count ?? 0))}
                    {s.description ? ` · ${s.description}` : ''}
                  </p>
                  {statusLine(s) && <p className="text-xs mt-0.5 truncate">{statusLine(s)}</p>}
                </div>
                {s.source && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title={t('adminDevotionalStreams', 'runNow', 'Run now')}
                    onClick={() => runNow(s)}
                    disabled={runningId === s.id}
                  >
                    {runningId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 text-purple-600" />}
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(s)} disabled={s.is_default}>
                  <Trash2 className={`h-4 w-4 ${s.is_default ? 'text-gray-300' : 'text-red-500'}`} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t('adminDevotionalStreams', 'editStream', 'Edit Stream') : t('adminDevotionalStreams', 'newStream', 'New Stream')}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>{t('adminDevotionalStreams', 'name', 'Name')}</Label>
                <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('adminDevotionalStreams', 'namePlaceholder', 'e.g. Morning Manna')} />
              </div>
              <div>
                <Label>{t('adminDevotionalStreams', 'description', 'Description')}</Label>
                <Textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>{t('adminDevotionalStreams', 'coverUrl', 'Cover image URL')}</Label>
                <Input value={editing.cover_image_url || ''} onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })} placeholder="https://…" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('adminDevotionalStreams', 'publicLabel', 'Listed publicly')}</Label>
                  <p className="text-xs text-gray-400">{t('adminDevotionalStreams', 'publicHint', 'Ministries and users can select this stream')}</p>
                </div>
                <Switch checked={editing.is_public ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_public: v })} />
              </div>
              <div>
                <Label>{t('adminDevotionalStreams', 'sortOrder', 'Sort order')}</Label>
                <Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} />
              </div>

              {/* ── Population mode ─────────────────────────────────────── */}
              <div className="border-t pt-4 space-y-3">
                <div>
                  <Label>{t('adminDevotionalStreams', 'population', 'How is this stream filled?')}</Label>
                  <Select value={mode} onValueChange={(v) => setEditing({ ...editing, mode: v as Mode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">{t('adminDevotionalStreams', 'manualOpt', 'Manual — I write each devotional')}</SelectItem>
                      <SelectItem value="ai">{t('adminDevotionalStreams', 'aiOpt', 'AI — generate one each day')}</SelectItem>
                      <SelectItem value="scrape">{t('adminDevotionalStreams', 'scrapeOpt', 'Feed — ingest from an RSS/Atom source')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {mode !== 'manual' && (
                    <p className="text-xs text-gray-400 mt-1">
                      {t('adminDevotionalStreams', 'draftHint', 'Runs daily and adds the devotional as a DRAFT — approve it in the Devotionals tab before it reaches users.')}
                    </p>
                  )}
                </div>

                {mode === 'ai' && (
                  <>
                    <div>
                      <Label>{t('adminDevotionalStreams', 'prompt', 'Theme / brief')}</Label>
                      <Textarea
                        rows={4}
                        value={editing.src_prompt || ''}
                        onChange={(e) => setEditing({ ...editing, src_prompt: e.target.value })}
                        placeholder={t('adminDevotionalStreams', 'promptPlaceholder', 'e.g. Warm, practical devotionals on grace and everyday faith for busy working adults. Encouraging tone, never preachy.')}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {t('adminDevotionalStreams', 'promptHint', 'Drives the theme and tone, and the passage rotates within it. Editable any time — no redeploy.')}
                      </p>
                    </div>
                  </>
                )}

                {mode === 'scrape' && (
                  <>
                    <div>
                      <Label>{t('adminDevotionalStreams', 'feedUrl', 'RSS / Atom feed URL')}</Label>
                      <Input
                        value={editing.src_source_url || ''}
                        onChange={(e) => setEditing({ ...editing, src_source_url: e.target.value })}
                        placeholder="https://example.com/devotional/feed.xml"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {t('adminDevotionalStreams', 'feedHint', 'Feeds only — HTML page scraping breaks silently when a site changes layout.')}
                      </p>
                    </div>
                    <div>
                      <Label className="flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t('adminDevotionalStreams', 'licence', 'Licence basis')}
                      </Label>
                      <Textarea
                        rows={2}
                        value={editing.src_license_basis || ''}
                        onChange={(e) => setEditing({ ...editing, src_license_basis: e.target.value })}
                        placeholder={t('adminDevotionalStreams', 'licencePlaceholder', 'e.g. Public domain (author d. 1917) · or: written permission from the publisher, 2026-07-02')}
                      />
                      <p className="text-xs text-amber-600 mt-1">
                        {t('adminDevotionalStreams', 'licenceHint', 'Why may this be republished? Republishing copyrighted devotionals is infringement even with attribution. The job refuses to run until this is recorded.')}
                      </p>
                    </div>
                  </>
                )}

                {mode !== 'manual' && (
                  <>
                    <div>
                      <Label>{t('adminDevotionalStreams', 'scriptureVersion', 'Scripture version')}</Label>
                      <Select value={editing.src_scripture_version || 'kjv'} onValueChange={(v) => setEditing({ ...editing, src_scripture_version: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BIBLE_VERSIONS.map((v) => <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('adminDevotionalStreams', 'scriptureVersionHint', 'Verse text is always fetched from the Bible API, never written by the model.')}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>{t('adminDevotionalStreams', 'active', 'Run daily')}</Label>
                        <p className="text-xs text-gray-400">{t('adminDevotionalStreams', 'activeHint', 'Turn off to pause without losing the settings')}</p>
                      </div>
                      <Switch checked={editing.src_is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, src_is_active: v })} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('adminDevotionalStreams', 'cancel', 'Cancel')}</Button>
            <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {t('adminDevotionalStreams', 'save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AdminDevotionalStreamsManager;
