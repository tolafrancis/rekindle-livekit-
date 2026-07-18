// src/components/ContentTranslationManager.tsx
// Admin tool to translate CONTENT (not UI strings) into other languages:
//   • "Translate all" bulk-enqueues whole libraries (devotional series, prayer
//     library, books, …) for the chosen languages via process-translation-queue
//     (action: queue_all). Skips items already translated/in flight.
//   • "Process queue now" drains the queue on demand (the pg_cron job drains it
//     automatically every ~2 min — see supabase/cron-setup-translation-queue.sql).
//
// Translation is one-time + cached: the worker stores each result in the content
// row's `translations` JSONB column and the underlying translate-content call is
// SHA-256 cached, so viewing translated content never re-translates.
//
// Admin-only; renders in English by design.
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Globe, Play, RefreshCw, Languages, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { translationQueueService, TranslationQueueStats } from '@/lib/translationQueueService';

// One row per (content_type, language_code) from the get_translation_coverage()
// RPC (migration 0178). language_code is null for a content type that has no
// translations at all — such a row exists purely to carry total_items.
interface CoverageRow {
  content_type: string;
  language_code: string | null;
  translated_items: number;
  total_items: number;
}

// Content types the bulk translator can target. Each maps to a table + field set
// server-side (CONTENT_TABLE_MAP / CONTENT_FIELD_MAP in process-translation-queue).
const CONTENT_TYPES: Array<{ type: string; label: string }> = [
  { type: 'devotional', label: 'Daily Devotionals (home widget)' },
  { type: 'ministry_devotional', label: 'Ministry Daily Devotionals' },
  { type: 'devotional_series', label: 'Devotional Series (titles)' },
  { type: 'devotional_entry', label: 'Devotional Readings (daily body)' },
  { type: 'prayer_library', label: 'Prayer Library' },
  { type: 'prayer_topic', label: 'Prayer Topics' },
  { type: 'book_summary', label: 'Books' },
  { type: 'affirmation', label: 'Affirmations' },
  { type: 'declaration', label: 'Declarations' },
];

const PROCESS_MAX_ITERATIONS = 40; // safety bound for the on-demand drain loop

export const ContentTranslationManager: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<TranslationQueueStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressNote, setProgressNote] = useState('');

  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    () => new Set(['devotional_series', 'devotional_entry', 'prayer_library', 'book_summary'])
  );
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(() => new Set(['vi']));
  const [forceRetranslate, setForceRetranslate] = useState(false);

  const langOptions = SUPPORTED_LANGUAGES.filter((l) => l.code !== 'en');

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      setStats(await translationQueueService.getQueueStats());
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingStats(false);
    }
  };

  const [coverage, setCoverage] = useState<CoverageRow[] | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [queueingLang, setQueueingLang] = useState<string | null>(null);

  const loadCoverage = async () => {
    setLoadingCoverage(true);
    setCoverageError(null);
    try {
      const { data, error } = await supabase.rpc('get_translation_coverage');
      if (error) throw error;
      setCoverage((data ?? []) as CoverageRow[]);
    } catch (e: any) {
      // Surfaced inline rather than as a toast — an empty panel with no
      // explanation is what made the old Translations tab unreadable.
      setCoverageError(e?.message || String(e));
    } finally {
      setLoadingCoverage(false);
    }
  };

  useEffect(() => { loadStats(); loadCoverage(); }, []);

  // Denominator = every item of every translatable type. Each content type
  // appears at least once in the RPC result (left join), so summing total_items
  // over DISTINCT content_type is exact even for types with zero translations.
  const totalItems = React.useMemo(() => {
    if (!coverage) return 0;
    const perType = new Map<string, number>();
    for (const r of coverage) perType.set(r.content_type, r.total_items);
    return Array.from(perType.values()).reduce((a, b) => a + b, 0);
  }, [coverage]);

  const perLanguage = React.useMemo(() => {
    if (!coverage) return [];
    const totals = new Map<string, number>();
    for (const r of coverage) {
      if (!r.language_code) continue; // total-carrier row, not a real language
      totals.set(r.language_code, (totals.get(r.language_code) ?? 0) + r.translated_items);
    }
    return Array.from(totals.entries())
      .map(([code, translated]) => {
        const meta = SUPPORTED_LANGUAGES.find((l) => l.code === code);
        return {
          code,
          translated,
          label: meta?.nativeName || meta?.name || code,
          flag: meta?.flag || '🌐',
          pct: totalItems > 0 ? Math.round((translated / totalItems) * 100) : 0,
        };
      })
      .sort((a, b) => b.translated - a.translated);
  }, [coverage, totalItems]);

  // Queue only what's missing for one language: queueAll skips items already
  // translated or in flight, so this is a "fill the gap" action, not a re-run.
  const handleQueueGap = async (code: string) => {
    setQueueingLang(code);
    try {
      const res = await translationQueueService.queueAll(
        CONTENT_TYPES.map((c) => c.type),
        [code],
        { createdBy: user?.id, force: false }
      );
      toast({
        title: 'Gap queued',
        description: `${res.totalQueued} translation(s) queued across ${res.totalItems} items (${res.skipped} already done/in-flight).`,
      });
      await loadStats();
    } catch (e: any) {
      toast({ title: 'Failed to queue', description: e.message, variant: 'destructive' });
    } finally {
      setQueueingLang(null);
    }
  };

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const handleQueueAll = async () => {
    const types = Array.from(selectedTypes);
    const langs = Array.from(selectedLangs);
    if (types.length === 0 || langs.length === 0) {
      toast({ title: 'Nothing selected', description: 'Pick at least one content type and one language.', variant: 'destructive' });
      return;
    }
    setQueueing(true);
    setProgressNote('');
    try {
      const res = await translationQueueService.queueAll(types, langs, { createdBy: user?.id, force: forceRetranslate });
      toast({
        title: forceRetranslate ? 'Re-translation queued' : 'Queued for translation',
        description: `${res.totalQueued} translations queued across ${res.totalItems} items (${res.skipped} already done/in-flight).`,
      });
      await loadStats();
    } catch (e: any) {
      toast({ title: 'Failed to queue', description: e.message, variant: 'destructive' });
    } finally {
      setQueueing(false);
    }
  };

  const handleProcessNow = async () => {
    setProcessing(true);
    let totalProcessed = 0, totalFailed = 0, totalRequeued = 0;
    try {
      for (let i = 0; i < PROCESS_MAX_ITERATIONS; i++) {
        const r = await translationQueueService.processQueue(15);
        totalProcessed += r.processed;
        totalFailed += r.failed;
        totalRequeued += r.reclaimed?.requeued ?? 0;
        setProgressNote(`Processed ${totalProcessed} item(s)${totalFailed ? `, ${totalFailed} failed` : ''}…`);
        await loadStats();
        if (r.total === 0) break; // queue drained
      }
      toast({
        title: 'Queue processed',
        description: `${totalProcessed} translated${totalFailed ? `, ${totalFailed} failed` : ''}${totalRequeued ? `, ${totalRequeued} stuck item(s) recovered` : ''}.`,
      });
    } catch (e: any) {
      toast({ title: 'Processing error', description: e.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
      setProgressNote('');
      loadStats();
    }
  };

  const [retrying, setRetrying] = useState(false);
  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      const res = await translationQueueService.retryAllFailed();
      toast({
        title: 'Failed items requeued',
        description: `${res.retried} requeued${res.removedDuplicates ? `, ${res.removedDuplicates} duplicate(s) removed` : ''}. Click "Process queue now" to translate them.`,
      });
      await loadStats();
    } catch (e: any) {
      toast({ title: 'Retry failed', description: e.message, variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  };

  const busy = queueing || processing || retrying || queueingLang !== null;

  return (
    <div className="space-y-6">
      {/* Translation coverage — which languages content already exists in */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Translation coverage
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadCoverage} disabled={loadingCoverage}>
            {loadingCoverage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          {coverageError ? (
            <div className="text-sm text-red-600">
              <div className="font-medium">Could not load coverage</div>
              <div className="font-mono text-xs mt-1 break-words">{coverageError}</div>
              <div className="text-xs text-muted-foreground mt-2">
                If this says the function does not exist, apply migration
                0178_translation_coverage_rpc.sql.
              </div>
            </div>
          ) : loadingCoverage && !coverage ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading coverage…
            </div>
          ) : perLanguage.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No content has been translated yet. Queue a language below to start.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                {totalItems.toLocaleString()} translatable item(s) across {CONTENT_TYPES.length} content types.
              </p>
              {perLanguage.map((l) => (
                <div key={l.code} className="flex items-center gap-3">
                  <div className="w-40 flex items-center gap-2 text-sm shrink-0">
                    <span>{l.flag}</span>
                    <span className="truncate">{l.label}</span>
                  </div>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-purple-600" style={{ width: `${l.pct}%` }} />
                  </div>
                  <div className="w-28 text-right text-sm tabular-nums shrink-0">
                    {l.translated.toLocaleString()}/{totalItems.toLocaleString()}
                  </div>
                  <div className="w-12 text-right text-xs text-muted-foreground shrink-0">{l.pct}%</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={busy || queueingLang !== null || l.translated >= totalItems}
                    onClick={() => handleQueueGap(l.code)}
                  >
                    {queueingLang === l.code
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : l.translated >= totalItems ? 'Complete' : 'Queue gap'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Content Translation Queue
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loadingStats}>
            {loadingStats ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['pending', 'processing', 'completed', 'failed'] as const).map((k) => (
              <div key={k} className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{stats ? (stats as any)[k] : '—'}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleProcessNow} disabled={busy}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Process queue now
            </Button>
            {!!stats?.failed && (
              <Button variant="outline" onClick={handleRetryFailed} disabled={busy}>
                {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Retry all failed ({stats.failed})
              </Button>
            )}
            {progressNote && <span className="text-sm text-muted-foreground">{progressNote}</span>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The queue also drains automatically every ~2 minutes once the pg_cron job is installed
            (supabase/cron-setup-translation-queue.sql). "Process now" is for immediate draining.
          </p>
        </CardContent>
      </Card>

      {/* Translate all */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" /> Translate all content
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="text-sm font-medium mb-2">Content types</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CONTENT_TYPES.map((c) => (
                <label key={c.type} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selectedTypes.has(c.type)} onCheckedChange={() => toggle(selectedTypes, c.type, setSelectedTypes)} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Target languages</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
              {langOptions.map((l) => (
                <label key={l.code} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selectedLangs.has(l.code)} onCheckedChange={() => toggle(selectedLangs, l.code, setSelectedLangs)} />
                  <span>{l.flag}</span>
                  <span className="truncate">{l.nativeName || l.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={handleQueueAll} disabled={busy}>
              {queueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
              {forceRetranslate ? 'Re-translate all' : 'Queue translations'}
            </Button>
            <Badge variant="secondary">
              {selectedTypes.size} type(s) × {selectedLangs.size} language(s)
            </Badge>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceRetranslate}
                onChange={(e) => setForceRetranslate(e.target.checked)}
              />
              <span>Force re-translate (backfill newly added fields)</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Enqueues every item of the selected types for the selected languages, skipping anything
            already translated or in flight. Translation is one-time and cached — items already done
            are not re-translated. <strong>Force re-translate</strong> re-queues items that are already
            marked complete so newly added translatable fields (e.g. reflection questions, extra
            scripture fields) get filled in — cached text is reused, so cost is modest. Then the queue
            (cron or "Process now") does the actual work and stores results.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContentTranslationManager;
