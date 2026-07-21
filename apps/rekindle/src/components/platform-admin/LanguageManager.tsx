// src/components/platform-admin/LanguageManager.tsx
// Phase 3.5 — self-service Language Manager. Lets an admin add a language,
// auto-draft its UI dictionary (machine translation of DEFAULT_TRANSLATIONS into
// the ui_translations table), review/edit the drafts, and publish it — with no
// code change. Reads/writes app_languages (registry) + ui_translations.
//
// This admin-only tool renders in English by design (it manages translations).
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_TRANSLATIONS,
  translationService,
  type Translations,
} from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Plus, Languages, Sparkles, Check, Trash2, Globe } from 'lucide-react';

interface AppLanguage {
  code: string;
  name: string;
  native_name: string;
  flag: string | null;
  rtl: boolean;
  region: string | null;
  enabled: boolean;
  ui_status: 'draft' | 'published';
  bible_version: string | null;
  sort_order: number;
}

interface UiString {
  id: string;
  namespace: string;
  key: string;
  value: string;
  reviewed: boolean;
}

// Flatten the in-code English dictionary to { namespace, key, en } rows.
// How many translate-content calls run at once during auto-draft / fill-missing.
// A full draft is ~8,270 strings = ~166 batches of 50; at 4 wide that is ~42
// rounds instead of 166 sequential ones. Raise for speed, lower if OpenAI
// rate-limits mid-draft — a failure is recoverable ("Fill missing" resumes from
// whatever was already upserted), but a slow success beats a fast 429.
const DRAFT_CONCURRENCY = 4;

function flattenDefaults(): Array<{ namespace: string; key: string; en: string }> {
  const out: Array<{ namespace: string; key: string; en: string }> = [];
  Object.entries(DEFAULT_TRANSLATIONS as Record<string, Record<string, string>>).forEach(([ns, vals]) => {
    Object.entries(vals).forEach(([key, en]) => out.push({ namespace: ns, key, en: String(en) }));
  });
  return out;
}

export const LanguageManager: React.FC = () => {
  const [languages, setLanguages] = useState<AppLanguage[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [draftingCode, setDraftingCode] = useState<string | null>(null);
  const [draftProgress, setDraftProgress] = useState<string>('');

  // Review panel state
  const [reviewCode, setReviewCode] = useState<string | null>(null);
  const [strings, setStrings] = useState<UiString[]>([]);
  const [stringsLoading, setStringsLoading] = useState(false);
  const [nsFilter, setNsFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const englishByKey = useMemo(() => {
    const m = new Map<string, string>();
    flattenDefaults().forEach(r => m.set(r.namespace + '.' + r.key, r.en));
    return m;
  }, []);

  const loadLanguages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_languages')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      toast({ title: 'Error', description: 'Failed to load languages (is the app_languages table deployed?)', variant: 'destructive' });
    } else {
      setLanguages((data as AppLanguage[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadLanguages(); }, []);

  const catalogue = useMemo(() => {
    const present = new Set(languages.map(l => l.code));
    return SUPPORTED_LANGUAGES.filter(l => !present.has(l.code));
  }, [languages]);

  const addLanguage = async () => {
    const meta = SUPPORTED_LANGUAGES.find(l => l.code === addCode);
    if (!meta) return;
    const { error } = await supabase.from('app_languages').insert({
      code: meta.code,
      name: meta.name,
      native_name: meta.nativeName,
      flag: meta.flag,
      rtl: !!meta.rtl,
      region: meta.region,
      font_family: meta.fontFamily ?? null,
      enabled: false,
      ui_status: 'draft',
      sort_order: languages.length + 1,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Language added', description: `${meta.name} added as a draft. Auto-draft, review, then publish it.` });
    setAddOpen(false);
    setAddCode('');
    loadLanguages();
  };

  // Translate + SAVE in small chunks so progress is persisted as it goes. If the
  // run stalls or a batch fails part-way, whatever was translated so far is
  // already in ui_translations, and re-running (Fill missing) resumes exactly
  // where it stopped — it skips keys that now exist. This is what makes a brand-
  // new language (all ~8k strings fresh, no cache) resilient instead of all-or-
  // nothing. ignoreDuplicates never clobbers existing/reviewed rows.
  const draftInChunks = async (
    code: string,
    flat: Array<{ namespace: string; key: string; en: string }>
  ): Promise<number> => {
    let saved = 0;
    let completed = 0;
    let firstError: unknown = null;

    // CHUNK is deliberately aligned with CHUNK_SIZE inside
    // translationService.translateUIStrings (i18n.ts). That function re-chunks
    // whatever it is given into batches of 50 and awaits them SEQUENTIALLY, so
    // passing 100 here used to mean every unit of work was silently two
    // round-trips deep. At 50 each unit is exactly one translate-content call,
    // which makes the concurrency below real rather than nominal — and means an
    // upsert lands twice as often, so a failure loses less work.
    const CHUNK = 50;

    // Pre-slice so workers just pull the next index.
    const groups: Array<typeof flat> = [];
    for (let i = 0; i < flat.length; i += CHUNK) groups.push(flat.slice(i, i + CHUNK));

    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (firstError) return;              // stop claiming new work after a failure
        const idx = next++;
        if (idx >= groups.length) return;
        const group = groups[idx];

        try {
          const partial: Record<string, Record<string, string>> = {};
          for (const r of group) (partial[r.namespace] ??= {})[r.key] = r.en;

          const translated = (await translationService.translateUIStrings(partial as any, code as any)) as Record<string, Record<string, string>>;

          const rows: Array<{ language_code: string; namespace: string; key: string; value: string; reviewed: boolean }> = [];
          Object.entries(translated).forEach(([ns, vals]) => {
            Object.entries(vals).forEach(([key, value]) => {
              if (value && typeof value === 'string') {
                rows.push({ language_code: code, namespace: ns, key, value, reviewed: false });
              }
            });
          });

          if (rows.length) {
            const { error } = await supabase
              .from('ui_translations')
              .upsert(rows, { onConflict: 'language_code,namespace,key', ignoreDuplicates: true });
            if (error) throw error;
            saved += rows.length;          // JS is single-threaded; no race here
          }
        } catch (e) {
          if (!firstError) firstError = e;  // first failure wins; peers finish their current chunk
          return;
        } finally {
          completed++;
          setDraftProgress(`Translating ${Math.min(completed * CHUNK, flat.length)} / ${flat.length}…`);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(DRAFT_CONCURRENCY, groups.length) }, () => worker())
    );

    // Rethrow so the caller still shows "progress was saved — click Fill missing
    // to resume". Everything upserted before the failure is already committed.
    if (firstError) throw firstError;
    return saved;
  };

  // Load the (namespace.key) already drafted for a language (paginated past the
  // 1000-row API cap).
  const loadDraftedKeys = async (code: string): Promise<Set<string>> => {
    const existing = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('ui_translations')
        .select('namespace, key')
        .eq('language_code', code)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) existing.add(`${r.namespace}.${r.key}`);
      if (data.length < 1000) break;
    }
    return existing;
  };

  // Full (re)translate of the whole English dictionary. Saves incrementally, so a
  // failure part-way keeps progress — click "Fill missing" to finish/resume.
  const autoDraft = async (code: string) => {
    setDraftingCode(code);
    setDraftProgress('Translating UI strings…');
    try {
      const saved = await draftInChunks(code, flattenDefaults());
      toast({ title: 'Draft ready', description: `${saved} strings drafted. Review, then publish.` });
    } catch (e: any) {
      toast({ title: 'Draft stopped', description: `${e?.message || 'Translation failed'} — progress was saved. Click "Fill missing" to resume.`, variant: 'destructive' });
    } finally {
      setDraftingCode(null);
      setDraftProgress('');
    }
  };

  // Fast + resumable: translate ONLY keys not already drafted for this language.
  // Ideal after a build adds new strings, AND as the "resume" for a new language
  // whose full draft stalled — it picks up exactly where it left off.
  const draftMissing = async (code: string) => {
    setDraftingCode(code);
    setDraftProgress('Finding missing strings…');
    try {
      const existing = await loadDraftedKeys(code);
      const missing = flattenDefaults().filter(r => !existing.has(`${r.namespace}.${r.key}`));
      if (missing.length === 0) {
        toast({ title: 'Nothing to draft', description: 'Every UI string already has a draft for this language.' });
        return;
      }
      const saved = await draftInChunks(code, missing);
      toast({ title: 'Missing strings drafted', description: `${saved} new string(s) added. Hard-refresh the app to see them.` });
    } catch (e: any) {
      toast({ title: 'Draft stopped', description: `${e?.message || 'Translation failed'} — progress was saved. Click "Fill missing" again to resume.`, variant: 'destructive' });
    } finally {
      setDraftingCode(null);
      setDraftProgress('');
    }
  };

  const openReview = async (code: string) => {
    setReviewCode(code);
    setNsFilter('all');
    setSearch('');
    setStringsLoading(true);
    // A language's dictionary far exceeds Supabase's default 1000-row API cap
    // (vi alone is ~8k rows). Page through with .range() so the review panel can
    // see/edit EVERY string — otherwise only ~1000 load and whole namespaces
    // vanish from the filter dropdown (derived from `strings`).
    const PAGE_SIZE = 1000;
    const all: UiString[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('ui_translations')
        .select('id, namespace, key, value, reviewed')
        .eq('language_code', code)
        .order('namespace', { ascending: true })
        .order('key', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        if (from === 0) toast({ title: 'Error', description: error.message, variant: 'destructive' });
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as UiString[]));
      if (data.length < PAGE_SIZE) break;
    }
    setStrings(all);
    setStringsLoading(false);
  };

  const saveString = async (row: UiString, value: string, reviewed: boolean) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from('ui_translations')
      .update({ value, reviewed })
      .eq('id', row.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else setStrings(prev => prev.map(s => s.id === row.id ? { ...s, value, reviewed } : s));
    setSavingId(null);
  };

  const setPublished = async (lang: AppLanguage, published: boolean) => {
    const { error } = await supabase
      .from('app_languages')
      .update({ ui_status: published ? 'published' : 'draft', enabled: published })
      .eq('code', lang.code);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: published ? 'Published' : 'Unpublished', description: `${lang.name} is now ${published ? 'live in the switcher' : 'hidden'}.` });
    loadLanguages();
  };

  const toggleEnabled = async (lang: AppLanguage, enabled: boolean) => {
    const { error } = await supabase.from('app_languages').update({ enabled }).eq('code', lang.code);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else loadLanguages();
  };

  const removeLanguage = async (lang: AppLanguage) => {
    if (lang.code === 'en') { toast({ title: 'Not allowed', description: 'English is the base language and cannot be removed.', variant: 'destructive' }); return; }
    if (!confirm(`Remove ${lang.name}? This deletes its registry entry and its ${lang.code} UI translations.`)) return;
    await supabase.from('ui_translations').delete().eq('language_code', lang.code);
    const { error } = await supabase.from('app_languages').delete().eq('code', lang.code);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Removed', description: `${lang.name} removed.` });
    loadLanguages();
  };

  const namespaces = useMemo(() => Array.from(new Set(strings.map(s => s.namespace))).sort(), [strings]);
  const filteredStrings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return strings.filter(s =>
      (nsFilter === 'all' || s.namespace === nsFilter) &&
      (!q || s.key.toLowerCase().includes(q) || s.value.toLowerCase().includes(q) ||
        (englishByKey.get(s.namespace + '.' + s.key) || '').toLowerCase().includes(q))
    );
  }, [strings, nsFilter, search, englishByKey]);

  const reviewLang = languages.find(l => l.code === reviewCode);
  const reviewedCount = strings.filter(s => s.reviewed).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> Language Manager</CardTitle>
          <Button onClick={() => setAddOpen(true)} disabled={catalogue.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Add language
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Add a language, auto-draft its UI dictionary, review the drafts, then publish it — no code change required.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : languages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No languages yet. If you just deployed the migration, add English + Vietnamese to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {languages.map(lang => (
              <div key={lang.code} className="flex items-center justify-between gap-3 rounded-lg border p-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{lang.flag || '🏳️'}</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{lang.name} <span className="text-muted-foreground">· {lang.native_name}</span></div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={lang.ui_status === 'published' ? 'default' : 'secondary'}>{lang.ui_status}</Badge>
                      <span className="text-xs text-muted-foreground uppercase">{lang.code}{lang.rtl ? ' · RTL' : ''}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Switch checked={lang.enabled} onCheckedChange={(v) => toggleEnabled(lang, v)} disabled={lang.code === 'en'} />
                    <span className="text-muted-foreground">Enabled</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => draftMissing(lang.code)} disabled={draftingCode === lang.code} title="Translate only strings not already drafted (fast)">
                    {draftingCode === lang.code ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    {draftingCode === lang.code ? (draftProgress || 'Drafting…') : 'Fill missing'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => autoDraft(lang.code)} disabled={draftingCode === lang.code} title="Re-translate the entire dictionary (slow)">
                    Auto-draft
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openReview(lang.code)}>Review</Button>
                  {lang.ui_status === 'published' ? (
                    <Button variant="outline" size="sm" onClick={() => setPublished(lang, false)}>Unpublish</Button>
                  ) : (
                    <Button size="sm" onClick={() => setPublished(lang, true)}><Check className="h-4 w-4 mr-1" /> Publish</Button>
                  )}
                  {lang.code !== 'en' && (
                    <Button variant="ghost" size="icon" onClick={() => removeLanguage(lang)} className="text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add language dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a language</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Pick a language to add. It starts as a draft; auto-draft and review before publishing.</p>
            <Select value={addCode} onValueChange={setAddCode}>
              <SelectTrigger><SelectValue placeholder="Select a language" /></SelectTrigger>
              <SelectContent>
                {catalogue.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.name} · {l.nativeName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addLanguage} disabled={!addCode}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={!!reviewCode} onOpenChange={(o) => { if (!o) setReviewCode(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Review — {reviewLang?.name}
              <Badge variant="secondary">{reviewedCount}/{strings.length} reviewed</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={nsFilter} onValueChange={setNsFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All namespaces ({strings.length})</SelectItem>
                {namespaces.map(ns => <SelectItem key={ns} value={ns}>{ns}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Search key / English / translation…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 mt-2">
            {stringsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : filteredStrings.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No strings. Run Auto-draft first, or adjust the filter.</p>
            ) : filteredStrings.map(row => (
              <ReviewRow
                key={row.id}
                row={row}
                english={englishByKey.get(row.namespace + '.' + row.key) || ''}
                saving={savingId === row.id}
                onSave={(value, reviewed) => saveString(row, value, reviewed)}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewCode(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const ReviewRow: React.FC<{
  row: UiString;
  english: string;
  saving: boolean;
  onSave: (value: string, reviewed: boolean) => void;
}> = ({ row, english, saving, onSave }) => {
  const [value, setValue] = useState(row.value);
  const [reviewed, setReviewed] = useState(row.reviewed);
  const dirty = value !== row.value || reviewed !== row.reviewed;
  return (
    <div className={`rounded-lg border p-3 ${row.reviewed ? 'bg-green-50/40 border-green-200' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-mono text-muted-foreground truncate">{row.namespace}.{row.key}</span>
        <label className="flex items-center gap-1.5 text-xs shrink-0">
          <Switch checked={reviewed} onCheckedChange={setReviewed} /> reviewed
        </label>
      </div>
      <p className="text-xs text-muted-foreground mb-1">EN: {english}</p>
      <Textarea value={value} onChange={e => setValue(e.target.value)} rows={Math.min(4, Math.max(1, Math.ceil(value.length / 60)))} className="text-sm" />
      <div className="flex justify-end mt-1.5">
        <Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty || saving} onClick={() => onSave(value, reviewed)}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default LanguageManager;
