// Bulk devotional import: upload a Word doc, a sheet (CSV / Excel, or a
// Google Doc / Sheet downloaded as one), or paste text, check every day in a
// preview, then save them all at once.
//
// Used in two places:
//   - Ministry Settings › Content › Devotionals (target kind 'ministry'),
//     saved to ministry_devotionals.
//   - Platform Admin › Devotional streams (target kind 'stream'), saved to
//     devotionals for that stream.
//
// Reading the file happens in the parse-devotional-import edge function
// (template columns / labels first, AI only for free-form docs). It returns
// rows and writes nothing; saving happens here, under the person's own RLS.
// Templates live at /templates/devotional-import-template.{docx,csv} in both apps.
import React, { useMemo, useState } from 'react';
import {
  Upload, FileText, FileSpreadsheet, Download, Loader2, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, Sparkles, Lightbulb, CalendarDays, ArrowLeft,
} from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Switch } from '@rekindle/ui/switch';
import { Checkbox } from '@rekindle/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { toast } from '@rekindle/ui/use-toast';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';

export type DevotionalImportTarget =
  | { kind: 'ministry'; ministryId: string; defaultAuthor?: string }
  | { kind: 'stream'; streamId: string; streamName?: string; defaultAuthor?: string; scriptureVersion?: string };

interface ParsedDevotional {
  date: string;
  date_text: string;
  title: string;
  author: string;
  scripture_reference: string;
  scripture_text: string;
  bible_passage_reference: string;
  bible_passage_text: string;
  message: string;
  prayer: string;
  reflection_questions: string[];
}

interface Row extends ParsedDevotional {
  key: number;
  include: boolean;
  replace: boolean;
  open: boolean;
}

interface Existing { id: string; title: string }

interface Props {
  target: DevotionalImportTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (count: number) => void;
}

const ACCEPT = '.docx,.csv,.tsv,.xlsx,.xls,.ods,.txt,.md,.htm,.html';
const MAX_BYTES = 10 * 1024 * 1024;

/** The fields to put in a doc or sheet, shown in the tips and the tour. */
export const DEVOTIONAL_IMPORT_FIELDS: Array<{ label: string; needed: boolean; hint: string }> = [
  { label: 'Date', needed: true, hint: 'The day it shows, best written as 2026-12-01.' },
  { label: 'Title', needed: true, hint: 'The devotional’s title.' },
  { label: 'Memory verse', needed: false, hint: 'The key verse reference, e.g. Psalm 24:1.' },
  { label: 'Memory verse text', needed: false, hint: 'The words of that verse.' },
  { label: 'Bible reading', needed: false, hint: 'A longer reading, e.g. 1 Chronicles 29:10-14.' },
  { label: 'Bible reading text', needed: false, hint: 'The words of the reading, if you want them shown.' },
  { label: 'Message', needed: true, hint: 'The devotional itself. Leave a blank line between paragraphs.' },
  { label: 'Prayer', needed: false, hint: 'A closing prayer.' },
  { label: 'Reflection questions', needed: false, hint: 'One question per line.' },
  { label: 'Author', needed: false, hint: 'Leave it out to use the author you set when importing.' },
];

const addDays = (isoDate: string, n: number) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export const DevotionalBulkImport: React.FC<Props> = ({ target, open, onOpenChange, onImported }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const tr = (key: string, fallback: string) => t('devotionalImport', key, fallback);

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<'sheet' | 'template' | 'ai'>('template');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [existing, setExisting] = useState<Map<string, Existing>>(new Map());
  const [author, setAuthor] = useState(target.defaultAuthor ?? '');
  const [version, setVersion] = useState(target.kind === 'stream' ? (target.scriptureVersion ?? 'NIV') : '');
  const [publish, setPublish] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ added: number; replaced: number; skipped: number; failed: string[] }>({ added: 0, replaced: 0, skipped: 0, failed: [] });

  const reset = () => {
    setStep('upload'); setFile(null); setPasted(''); setShowPaste(false); setRows([]);
    setWarnings([]); setExisting(new Map()); setStartDate(''); setPublish(false);
  };
  const close = (next: boolean) => {
    if (!next && (parsing || saving)) return;
    onOpenChange(next);
    if (!next) setTimeout(reset, 200);
  };

  const loadExisting = async (): Promise<Map<string, Existing>> => {
    const map = new Map<string, Existing>();
    if (target.kind === 'ministry') {
      const { data } = await supabase
        .from('ministry_devotionals')
        .select('id, title, scheduled_date, date')
        .eq('ministry_id', target.ministryId);
      (data ?? []).forEach((d: any) => {
        const day = d.scheduled_date || d.date;
        if (day && !map.has(day)) map.set(day, { id: d.id, title: d.title });
      });
    } else {
      const { data } = await supabase
        .from('devotionals')
        .select('id, title, schedule_date')
        .eq('stream_id', target.streamId)
        .not('schedule_date', 'is', null);
      (data ?? []).forEach((d: any) => {
        if (!map.has(d.schedule_date)) map.set(d.schedule_date, { id: String(d.id), title: d.title });
      });
    }
    return map;
  };

  const readFile = async () => {
    if (!file && !pasted.trim()) {
      toast({ title: tr('nothingChosen', 'Choose a file or paste your devotionals first.'), variant: 'destructive' });
      return;
    }
    if (file && file.size > MAX_BYTES) {
      toast({ title: tr('tooBig', 'That file is over 10 MB. Split it into smaller files.'), variant: 'destructive' });
      return;
    }
    setParsing(true);
    try {
      const body: Record<string, unknown> = target.kind === 'ministry'
        ? { ministry_id: target.ministryId }
        : { stream_id: target.streamId };
      if (file) { body.file_name = file.name; body.file_base64 = await readAsBase64(file); }
      else body.text = pasted;
      const [{ data, error }, found] = await Promise.all([
        supabase.functions.invoke('parse-devotional-import', { body }),
        loadExisting(),
      ]);
      if (error || data?.error) {
        let msg = data?.error as string | undefined;
        if (!msg && error && (error as any).context?.json) {
          try { msg = (await (error as any).context.json())?.error; } catch { /* keep generic */ }
        }
        throw new Error(msg || error?.message || tr('readFailed', 'The file could not be read.'));
      }
      const parsed = (data?.devotionals ?? []) as ParsedDevotional[];
      setExisting(found);
      setMode(data?.mode ?? 'template');
      setWarnings(data?.warnings ?? []);
      setRows(parsed.map((d, i) => ({ ...d, key: i, include: true, replace: false, open: false })));
      setStep('preview');
    } catch (err: any) {
      toast({ title: tr('readFailedTitle', 'Couldn’t read that file'), description: err?.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  // Dates used more than once in the file.
  const dupInFile = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((r) => { if (r.include && r.date) seen.set(r.date, (seen.get(r.date) ?? 0) + 1); });
    return new Set([...seen].filter(([, n]) => n > 1).map(([d]) => d));
  }, [rows]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const missingDates = rows.filter((r) => r.include && !r.date).length;
  const fillDates = () => {
    if (!startDate) return;
    let n = 0;
    setRows((rs) => rs.map((r) => (r.include && !r.date ? { ...r, date: addDays(startDate, n++) } : r)));
  };
  const shiftAllFrom = () => {
    if (!startDate) return;
    let n = 0;
    setRows((rs) => rs.map((r) => (r.include ? { ...r, date: addDays(startDate, n++) } : r)));
  };

  const problems = (r: Row) => {
    const p: string[] = [];
    if (!r.title.trim()) p.push(tr('noTitle', 'No title'));
    if (!r.message.trim()) p.push(tr('noMessage', 'No message'));
    if (!r.date) p.push(tr('noDate', 'No date'));
    if (r.date && dupInFile.has(r.date)) p.push(tr('dupInFile', 'Same date as another day in this file'));
    return p;
  };

  const toSave = rows.filter((r) => r.include && r.title.trim() && r.message.trim());
  const willSkip = toSave.filter((r) => r.date && existing.has(r.date) && !r.replace).length;
  const blocked = toSave.some((r) => r.date && dupInFile.has(r.date));

  const payloadFor = (r: Row, isNew: boolean): Record<string, unknown> => {
    const day = r.date || null;
    const by = r.author.trim() || author.trim();
    const questions = r.reflection_questions.map((q) => q.trim()).filter(Boolean);
    if (target.kind === 'ministry') {
      const p: Record<string, unknown> = {
        ministry_id: target.ministryId,
        author_name: by || 'Ministry Team',
        title: r.title.trim(),
        content: r.message.trim(),
        scripture_reference: r.scripture_reference.trim() || null,
        scripture_text: r.scripture_text.trim() || null,
        bible_passage_reference: r.bible_passage_reference.trim() || null,
        bible_passage_text: r.bible_passage_text.trim() || null,
        reflection_questions: questions,
        prayer_focus: r.prayer.trim() || null,
        is_published: publish,
        status: publish ? 'published' : 'draft',
        visibility: 'public',
        distribution_scope: 'ministry_only',
        consumption_location: 'main_app',
        scheduled_date: day,
        date: day,
      };
      if (isNew) { p.creator_id = user!.id; p.created_by = user!.id; }
      return p;
    }
    const ref = r.scripture_reference.trim();
    const ver = version.trim() || 'NIV';
    return {
      stream_id: target.streamId,
      schedule_date: day,
      is_published: publish,
      language: 'en',
      author: by || null,
      title: r.title.trim(),
      scripture: ref || null,
      scripture_reference: ref || null,
      scripture_text: r.scripture_text.trim() || null,
      scripture_version: ver,
      bible_passage_reference: r.bible_passage_reference.trim() || null,
      bible_passage_text: r.bible_passage_text.trim() || null,
      message: r.message.trim(),
      prayer: r.prayer.trim() || null,
      reflection_questions: questions,
      scripture_references: ref ? [{ reference: ref, text: r.scripture_text.trim(), version: ver }] : [],
    };
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const table = target.kind === 'ministry' ? 'ministry_devotionals' : 'devotionals';
    const failed: string[] = [];
    let added = 0, replaced = 0, skipped = 0;
    try {
      const inserts: Row[] = [];
      for (const r of toSave) {
        const prior = r.date ? existing.get(r.date) : undefined;
        if (prior && !r.replace) { skipped++; continue; }
        if (prior) {
          const { data, error } = await supabase.from(table).update(payloadFor(r, false)).eq('id', prior.id).select('id');
          if (error || !data?.length) failed.push(`${r.title}: ${error?.message ?? tr('noPermission', 'not allowed')}`);
          else replaced++;
        } else {
          inserts.push(r);
        }
      }
      for (let i = 0; i < inserts.length; i += 50) {
        const chunk = inserts.slice(i, i + 50);
        const { error } = await supabase.from(table).insert(chunk.map((r) => payloadFor(r, true)));
        if (!error) { added += chunk.length; continue; }
        // One bad row fails the batch; retry one at a time so the rest still save.
        for (const r of chunk) {
          const { error: oneError } = await supabase.from(table).insert(payloadFor(r, true));
          if (oneError) failed.push(`${r.title}: ${oneError.message}`);
          else added++;
        }
      }
      setResult({ added, replaced, skipped, failed });
      setStep('done');
      if (added + replaced > 0) onImported?.(added + replaced);
    } finally {
      setSaving(false);
    }
  };

  const tips = (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <button type="button" className="flex w-full items-center gap-2 font-medium" onClick={() => setShowTips((v) => !v)}>
        <Lightbulb className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{tr('tipsTitle', 'How to lay out your file')}</span>
        {showTips ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {showTips && (
        <div className="mt-2 space-y-2">
          <p>
            {tr('tipsSheet', 'In a sheet (Excel, Google Sheets or CSV): one row per day, with these column headings in the first row.')}
          </p>
          <p>
            {tr('tipsDoc', 'In a document (Word or Google Docs): one block per day. Start each day with its Date line and write each part after its label and a colon, for example “Title: Faithful in Little”.')}
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {DEVOTIONAL_IMPORT_FIELDS.map((f) => (
              <li key={f.label} className="leading-snug">
                <span className="font-semibold">{tr(`field.${f.label}`, f.label)}</span>
                {f.needed && <span className="ml-1 text-xs text-amber-700">({tr('needed', 'needed')})</span>}
                <span className="block text-xs text-amber-800">{tr(`hint.${f.label}`, f.hint)}</span>
              </li>
            ))}
          </ul>
          <p>
            {tr('tipsGoogle', 'Using Google Docs or Sheets? Choose File › Download › Microsoft Word (.docx) or Microsoft Excel (.xlsx) and upload that, or copy everything and paste it below.')}
          </p>
          <p className="flex items-start gap-1.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {tr('tipsAi', 'Already written them your own way? Upload it anyway. AI will find each day, title, verse, message and prayer, and you check everything before it is saved.')}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-purple-600" />
            {tr('title', 'Import devotionals')}
          </DialogTitle>
          <DialogDescription>
            {target.kind === 'stream' && target.streamName
              ? tr('descStream', 'Add many days at once to {stream} from a document or sheet.').replace('{stream}', target.streamName)
              : tr('desc', 'Add many days at once from a Word or Google document, or an Excel, Google or CSV sheet.')}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            {tips}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/templates/devotional-import-template.docx" download>
                  <FileText className="mr-2 h-4 w-4" />{tr('docTemplate', 'Word template')}<Download className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/templates/devotional-import-template.csv" download>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />{tr('sheetTemplate', 'Sheet template (CSV)')}<Download className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-purple-200 p-6 text-center hover:bg-purple-50">
              <Upload className="h-6 w-6 text-purple-500" />
              <span className="font-medium">{file ? file.name : tr('chooseFile', 'Choose a file')}</span>
              <span className="text-xs text-gray-500">{tr('fileTypes', 'Word (.docx), Excel (.xlsx), CSV or text, up to 10 MB')}</span>
              <input
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPasted(''); e.target.value = ''; }}
              />
            </label>

            <div>
              <button type="button" className="text-sm font-medium text-purple-700" onClick={() => setShowPaste((v) => !v)}>
                {showPaste ? tr('hidePaste', 'Hide the text box') : tr('orPaste', 'Or paste the text instead')}
              </button>
              {showPaste && (
                <Textarea
                  className="mt-2 min-h-[160px]"
                  placeholder={tr('pastePlaceholder', 'Date: 2026-12-01\nTitle: Faithful in Little\nMemory verse: Luke 16:10\nMessage:\n...')}
                  value={pasted}
                  onChange={(e) => { setPasted(e.target.value); if (e.target.value) setFile(null); }}
                />
              )}
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{tr('found', '{n} days found').replace('{n}', String(rows.length))}</Badge>
              {mode === 'ai' && <Badge className="bg-purple-100 text-purple-700"><Sparkles className="mr-1 h-3 w-3" />{tr('readByAi', 'Read by AI')}</Badge>}
              {mode === 'sheet' && <Badge variant="outline">{tr('readSheet', 'Read from sheet columns')}</Badge>}
              {mode === 'template' && <Badge variant="outline">{tr('readTemplate', 'Read from template labels')}</Badge>}
            </div>

            {warnings.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {warnings.map((w) => <p key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</p>)}
              </div>
            )}

            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="imp-author">{tr('author', 'Author')}</Label>
                <Input id="imp-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={tr('authorPh', 'Used when a day names no author')} />
              </div>
              {target.kind === 'stream' && (
                <div>
                  <Label htmlFor="imp-version">{tr('version', 'Bible version')}</Label>
                  <Input id="imp-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="NIV" />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="imp-start" className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{tr('dates', 'Dates')}</Label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Input id="imp-start" type="date" className="w-44" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <Button variant="outline" size="sm" disabled={!startDate || !missingDates} onClick={fillDates}>
                    {tr('fillMissing', 'Fill {n} missing dates from here').replace('{n}', String(missingDates))}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={!startDate} onClick={shiftAllFrom}>
                    {tr('redateAll', 'Re-date every day from here')}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch id="imp-publish" checked={publish} onCheckedChange={setPublish} />
                <Label htmlFor="imp-publish" className="font-normal">
                  {publish
                    ? tr('publishOn', 'Publish: each day appears for members on its date')
                    : tr('publishOff', 'Save as drafts: nothing is shown to members until you publish')}
                </Label>
              </div>
            </div>

            <div className="divide-y rounded-lg border">
              {rows.map((r) => {
                const prior = r.date ? existing.get(r.date) : undefined;
                const issues = problems(r);
                return (
                  <div key={r.key} className={`p-3 ${r.include ? '' : 'opacity-50'}`}>
                    <div className="flex flex-wrap items-start gap-2">
                      <Checkbox
                        checked={r.include}
                        onCheckedChange={(v) => update(r.key, { include: v === true })}
                        aria-label={tr('include', 'Include this day')}
                        className="mt-2"
                      />
                      <Input
                        type="date"
                        className="w-40"
                        value={r.date}
                        onChange={(e) => update(r.key, { date: e.target.value })}
                        aria-label={tr('date', 'Date')}
                      />
                      <Input
                        className="min-w-[12rem] flex-1"
                        value={r.title}
                        onChange={(e) => update(r.key, { title: e.target.value })}
                        aria-label={tr('titleField', 'Title')}
                      />
                      <Button variant="ghost" size="sm" onClick={() => update(r.key, { open: !r.open })}>
                        {r.open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="ml-1">{tr('check', 'Check')}</span>
                      </Button>
                    </div>
                    <div className="ml-6 mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {r.date_text && r.date_text !== r.date && <span className="text-gray-400">{tr('written', 'Written as “{d}”').replace('{d}', r.date_text)}</span>}
                      {r.scripture_reference && <Badge variant="outline" className="text-xs">{r.scripture_reference}</Badge>}
                      {r.prayer && <Badge variant="outline" className="text-xs">{tr('hasPrayer', 'Prayer')}</Badge>}
                      {r.reflection_questions.length > 0 && <Badge variant="outline" className="text-xs">{tr('nQuestions', '{n} questions').replace('{n}', String(r.reflection_questions.length))}</Badge>}
                      {issues.map((p) => <Badge key={p} className="bg-red-50 text-xs text-red-700">{p}</Badge>)}
                      {prior && r.include && (
                        <span className="flex items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-amber-800">
                          {tr('alreadyHas', 'This date already has “{t}”').replace('{t}', prior.title)}
                          <button type="button" className={`font-semibold underline ${r.replace ? '' : 'text-amber-900'}`} onClick={() => update(r.key, { replace: !r.replace })}>
                            {r.replace ? tr('willReplace', 'Will replace it (keep it instead)') : tr('willSkip', 'Will skip this day (replace it instead)')}
                          </button>
                        </span>
                      )}
                    </div>
                    {r.open && (
                      <div className="ml-6 mt-3 grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs">{tr('field.Memory verse', 'Memory verse')}</Label>
                          <Input value={r.scripture_reference} onChange={(e) => update(r.key, { scripture_reference: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">{tr('field.Bible reading', 'Bible reading')}</Label>
                          <Input value={r.bible_passage_reference} onChange={(e) => update(r.key, { bible_passage_reference: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">{tr('field.Memory verse text', 'Memory verse text')}</Label>
                          <Textarea rows={2} value={r.scripture_text} onChange={(e) => update(r.key, { scripture_text: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">{tr('field.Message', 'Message')}</Label>
                          <Textarea rows={8} value={r.message} onChange={(e) => update(r.key, { message: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">{tr('field.Prayer', 'Prayer')}</Label>
                          <Textarea rows={3} value={r.prayer} onChange={(e) => update(r.key, { prayer: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">{tr('field.Reflection questions', 'Reflection questions')} ({tr('onePerLine', 'one per line')})</Label>
                          <Textarea
                            rows={3}
                            value={r.reflection_questions.join('\n')}
                            onChange={(e) => update(r.key, { reflection_questions: e.target.value.split('\n') })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{tr('author', 'Author')}</Label>
                          <Input value={r.author} placeholder={author} onChange={(e) => update(r.key, { author: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {blocked && (
              <p className="flex items-center gap-1.5 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />{tr('fixDup', 'Two days share a date. Change one of the dates or untick one to continue.')}
              </p>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3 py-2 text-sm">
            <p className="flex items-center gap-2 text-base font-medium text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              {tr('doneTitle', '{n} devotionals saved').replace('{n}', String(result.added + result.replaced))}
            </p>
            <ul className="list-disc space-y-1 pl-6 text-gray-600">
              <li>{tr('doneAdded', '{n} new').replace('{n}', String(result.added))}</li>
              {result.replaced > 0 && <li>{tr('doneReplaced', '{n} replaced').replace('{n}', String(result.replaced))}</li>}
              {result.skipped > 0 && <li>{tr('doneSkipped', '{n} skipped because the date already had a devotional').replace('{n}', String(result.skipped))}</li>}
            </ul>
            {!publish && result.added + result.replaced > 0 && (
              <p className="text-gray-600">{tr('doneDrafts', 'They are saved as drafts. Open each one to publish it, or import again with Publish switched on.')}</p>
            )}
            {result.failed.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                <p className="font-medium">{tr('doneFailed', 'These could not be saved:')}</p>
                <ul className="mt-1 list-disc pl-5">{result.failed.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={parsing}>{tr('cancel', 'Cancel')}</Button>
              <Button onClick={readFile} disabled={parsing || (!file && !pasted.trim())}>
                {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                {parsing ? tr('reading', 'Reading… (AI can take up to a minute)') : tr('readFile', 'Read file')}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')} disabled={saving}>
                <ArrowLeft className="mr-2 h-4 w-4" />{tr('back', 'Back')}
              </Button>
              <Button onClick={save} disabled={saving || blocked || toSave.length - willSkip === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tr('importN', 'Import {n} devotionals').replace('{n}', String(toSave.length - willSkip))}
              </Button>
            </>
          )}
          {step === 'done' && (
            <>
              <Button variant="outline" onClick={reset}>{tr('importMore', 'Import another file')}</Button>
              <Button onClick={() => close(false)}>{tr('close', 'Close')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DevotionalBulkImport;
