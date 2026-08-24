import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { FileText, UploadCloud, Sparkles, CheckCircle2, Trash2, Link2, Youtube } from 'lucide-react';

interface SermonEntry {
  id: string;
  title: string;
  speaker: string;
  transcript: string;
  fileName?: string;
  sourceType?: 'upload' | 'link' | 'youtube';
  sourceUrl?: string;
  createdAt: string;
  approvedTerms: string[];
  transcriptionPending?: boolean;
}

interface MinistrySermonLibraryProps {
  ministryId: string;
}

const STORAGE_KEY = (ministryId: string) => `rekindle:sermon-library:${ministryId}`;
const TERMS_KEY = (ministryId: string) => `rekindle:sermon-vocabulary:${ministryId}`;

const defaultTerms = [
  'praise God',
  'Holy Spirit',
  'by God\'s grace',
  'we are trusting God',
  'House Fellowship',
  'RCCG',
  'God Almighty',
];

const phrasePatterns = [
  'praise God',
  'Holy Spirit',
  'Holy Ghost',
  'by God\'s grace',
  'by the grace of God',
  'we are trusting God',
  'House Fellowship',
  'Sunday School',
  'General Overseer',
  'God Almighty',
  'Redeemed Christian Church of God',
  'RCCG',
  'I want to appreciate you',
  'let us',
  'let me quickly say',
  'amen',
  'hallelujah',
  'hosanna',
];

function normalizeTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim();
}

function extractApprovedTerms(transcript: string): string[] {
  const lower = transcript.toLowerCase();
  const found = new Set<string>();

  for (const phrase of phrasePatterns) {
    if (lower.includes(phrase.toLowerCase())) {
      found.add(normalizeTerm(phrase));
    }
  }

  for (const line of transcript.split(/\n|\./)) {
    const text = normalizeTerm(line);
    if (!text) continue;
    if (text.length < 3 || text.length > 80) continue;
    if (/\b(?:God|Spirit|grace|church|ministry|RCCG|House Fellowship|Sunday School|praise|worship|prayer)\b/i.test(text)) {
      found.add(text);
    }
  }

  return [...found].filter((term) => term.length > 2).slice(0, 25);
}

export const MinistrySermonLibrary: React.FC<MinistrySermonLibraryProps> = ({ ministryId }) => {
  const [sermons, setSermons] = useState<SermonEntry[]>([]);
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [transcript, setTranscript] = useState('');
  const [fileName, setFileName] = useState('');
  const [sourceType, setSourceType] = useState<'upload' | 'link' | 'youtube'>('upload');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loadingSavedData, setLoadingSavedData] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSavedData = async () => {
      if (typeof window === 'undefined') return;

      try {
        const localSaved = localStorage.getItem(STORAGE_KEY(ministryId));
        const localTerms = localStorage.getItem(TERMS_KEY(ministryId));

        let nextTerms = defaultTerms;
        let nextSermons: SermonEntry[] = [];

        if (localSaved) {
          nextSermons = JSON.parse(localSaved) as SermonEntry[];
        }

        if (localTerms) {
          nextTerms = JSON.parse(localTerms) as string[];
        }

        setSermons(nextSermons);
        setCustomTerms(nextTerms);

        const { data: dbTerms } = await supabase
          .from('ministry_sermon_vocabularies')
          .select('term')
          .eq('ministry_id', ministryId);

        if (dbTerms && dbTerms.length > 0) {
          const persistedTerms = [...new Set(dbTerms.map((row) => row.term as string).filter(Boolean))];
          setCustomTerms(persistedTerms);
          localStorage.setItem(TERMS_KEY(ministryId), JSON.stringify(persistedTerms));
        }

        const { data: dbSermons } = await supabase
          .from('ministry_sermon_library')
          .select('id, title, speaker, transcript, file_name, source_type, source_url, created_at, approved_terms, status, processing_error')
          .eq('ministry_id', ministryId)
          .order('created_at', { ascending: false });

        if (dbSermons && dbSermons.length > 0) {
          const mapped: SermonEntry[] = dbSermons.map((row) => ({
            id: row.id,
            title: row.title,
            speaker: row.speaker || 'Unknown speaker',
            transcript: row.transcript || '',
            fileName: row.file_name || undefined,
            sourceType: (row.source_type as 'upload' | 'link' | 'youtube') || 'upload',
            sourceUrl: row.source_url || undefined,
            createdAt: row.created_at,
            approvedTerms: Array.isArray(row.approved_terms) ? row.approved_terms : [],
            transcriptionPending: (row.status && row.status !== 'done') || false,
          }));
          setSermons(mapped);
          localStorage.setItem(STORAGE_KEY(ministryId), JSON.stringify(mapped));
        }
      } catch {
        setCustomTerms(defaultTerms);
      } finally {
        setLoadingSavedData(false);
      }
    };

    loadSavedData();
  }, [ministryId]);

  // Poll for updated transcripts (a background worker will update DB when
  // transcription completes). Refresh sermons every 8 seconds while this
  // component is mounted so the UI shows transcripts as soon as they're
  // available.
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const { data: dbSermons } = await supabase
          .from('ministry_sermon_library')
          .select('id, title, speaker, transcript, file_name, source_type, source_url, created_at, approved_terms')
          .eq('ministry_id', ministryId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (dbSermons) {
          const mapped: SermonEntry[] = dbSermons.map((row) => ({
            id: row.id,
            title: row.title,
            speaker: row.speaker || 'Unknown speaker',
            transcript: row.transcript || '',
            fileName: row.file_name || undefined,
            sourceType: (row.source_type as 'upload' | 'link' | 'youtube') || 'upload',
            sourceUrl: row.source_url || undefined,
            createdAt: row.created_at,
            approvedTerms: Array.isArray(row.approved_terms) ? row.approved_terms : [],
          }));
          setSermons(mapped);
          localStorage.setItem(STORAGE_KEY(ministryId), JSON.stringify(mapped));
        }
      } catch (err) {
        // ignore polling errors — keep UI responsive
      }
    }, 8000);

    return () => clearInterval(iv);
  }, [ministryId]);

  const extractedTerms = useMemo(() => extractApprovedTerms(transcript), [transcript]);

  const persistSermons = (next: SermonEntry[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY(ministryId), JSON.stringify(next));
    setSermons(next);
  };

  const persistTerms = async (next: string[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TERMS_KEY(ministryId), JSON.stringify(next));
    setCustomTerms(next);

    try {
      const uniqueTerms = [...new Set(next.map((term) => normalizeTerm(term)).filter(Boolean))];
      if (!uniqueTerms.length) return;

      const rows = uniqueTerms.map((term) => ({ ministry_id: ministryId, term }));
      const { error } = await supabase.from('ministry_sermon_vocabularies').upsert(rows, { onConflict: 'ministry_id,term' });
      if (error) throw error;
    } catch (err: any) {
      console.error('[MinistrySermonLibrary] failed to persist terms:', err);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isTextFile = /\.(txt|md|csv|json)$/i.test(file.name);
    setFileName(file.name);

    if (isTextFile) {
      const content = await file.text();
      setTranscript((current) => current ? `${current}\n\n${content}` : content);
      toast({
        title: 'Transcript loaded',
        description: `${file.name} was imported into the transcript editor.`,
      });
    } else {
      // Upload audio/video to Supabase Storage and create DB record so a
      // background worker can transcribe it and update the sermon row.
      try {
        // Request a signed PUT URL from the signer service. The signer URL can
        // be provided via Vite env `VITE_R2_SIGNER_URL` or defaults to
        // `${window.location.origin}/signed-put` (adjust if you host signer
        // separately).
        const signerUrl = (import.meta as any).env?.VITE_R2_SIGNER_URL || `${window.location.origin}/signed-put`;
        const key = `sermon-audio/${ministryId}/${Date.now()}-${file.name}`;
        const resp = await fetch(signerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, contentType: file.type }),
        });
        if (!resp.ok) throw new Error(`Signer responded ${resp.status}`);
        const body = await resp.json();
        const { signedUrl, publicUrl } = body;

        // Upload file directly to R2 using the presigned URL
        const put = await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        if (!put.ok) throw new Error(`Upload failed ${put.status}`);

        // create a DB row for this uploaded sermon (empty transcript for worker)
        const { data: inserted, error: insertErr } = await supabase
          .from('ministry_sermon_library')
          .insert({
            ministry_id: ministryId,
            title: title.trim() || file.name,
            speaker: speaker.trim() || 'Unknown speaker',
            transcript: '',
            file_name: file.name,
            source_type: 'upload',
            source_url: publicUrl,
            status: 'pending',
            processing_error: null,
          })
          .select('id, created_at')
          .single();

        if (insertErr) throw insertErr;

        // Optimistically add to local list with pending state so UI shows progress
        const entry: SermonEntry = {
          id: inserted?.id || `${Date.now()}`,
          title: title.trim() || file.name,
          speaker: speaker.trim() || 'Unknown speaker',
          transcript: '',
          fileName: file.name,
          sourceType: 'upload',
          sourceUrl: publicUrl,
          createdAt: inserted?.created_at || new Date().toISOString(),
          approvedTerms: [],
          transcriptionPending: true,
        };

        persistSermons([entry, ...sermons]);

        toast({
          title: 'Audio uploaded',
          description: `${file.name} uploaded for transcription. Will appear here when ready.`,
        });
      } catch (err: any) {
        console.error('[MinistrySermonLibrary] upload failed:', err);
        toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
      }
    }

    event.target.value = '';
  };

  const handleSaveSermon = async () => {
    if (!title.trim()) {
      toast({
        title: 'Missing sermon data',
        description: 'Add a sermon title before saving.',
        variant: 'destructive',
      });
      return;
    }

    if (!transcript.trim() && !sourceUrl.trim()) {
      toast({
        title: 'Missing sermon source',
        description: 'Add a transcript, upload a file, or paste a sermon link before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    const approvedTerms = extractApprovedTerms(transcript || sourceUrl || title);
    const entry: SermonEntry = {
      id: `${Date.now()}`,
      title: title.trim(),
      speaker: speaker.trim() || 'Unknown speaker',
      transcript: transcript.trim(),
      fileName: fileName || undefined,
      sourceType,
      sourceUrl: sourceUrl.trim() || undefined,
      createdAt: new Date().toISOString(),
      approvedTerms,
    };

    const next = [entry, ...sermons];
    persistSermons(next);

    try {
        const { data: inserted, error: sermonError } = await supabase
        .from('ministry_sermon_library')
        .insert({
          ministry_id: ministryId,
          title: entry.title,
          speaker: entry.speaker,
          transcript: entry.transcript,
          file_name: entry.fileName || null,
          source_type: entry.sourceType || 'upload',
          source_url: entry.sourceUrl || null,
            status: 'pending',
            processing_error: null,
          approved_terms: approvedTerms,
        })
        .select('id')
        .single();

      if (sermonError) throw sermonError;

      const nextTerms = [...new Set([...customTerms, ...approvedTerms])];
      await persistTerms(nextTerms);

      if (inserted?.id) {
        const termRows = nextTerms.map((term) => ({
          ministry_id: ministryId,
          term,
          source_sermon_id: inserted.id,
        }));
        const { error: termUpsertError } = await supabase
          .from('ministry_sermon_vocabularies')
          .upsert(termRows, { onConflict: 'ministry_id,term' });
        if (termUpsertError) throw termUpsertError;
      }
    } catch (err: any) {
      console.error('[MinistrySermonLibrary] failed to persist sermon to Supabase:', err);
      toast({
        title: 'Saved locally',
        description: 'The sermon was saved in the browser, but Supabase sync failed. You can retry later.',
        variant: 'destructive',
      });
    }

    setTitle('');
    setSpeaker('');
    setTranscript('');
    setFileName('');
    setSourceUrl('');
    setSourceType('upload');
    setSaving(false);

    toast({
      title: 'Sermon saved',
      description: 'The draft sermon and its approved sermon terms are ready for future STT tuning.',
    });
  };

  const handleAddExtractedTerms = async () => {
    if (!extractedTerms.length) {
      toast({
        title: 'No terms found',
        description: 'Paste or type a sermon transcript first so we can extract terms.',
        variant: 'destructive',
      });
      return;
    }

    const next = [...new Set([...customTerms, ...extractedTerms])];
    await persistTerms(next);
    toast({
      title: 'Custom sermon terms added',
      description: `${next.length} terms are now available for the ministry's live STT tuning.`,
    });
  };

  const removeTerm = async (term: string) => {
    const next = customTerms.filter((item) => item !== term);
    await persistTerms(next);
    try {
      await supabase.from('ministry_sermon_vocabularies').delete().eq('ministry_id', ministryId).eq('term', term);
    } catch (err) {
      console.error('[MinistrySermonLibrary] failed to remove term from Supabase:', err);
    }
  };

  const addSermonTerms = async (sermonTerms: string[]) => {
    if (!sermonTerms || sermonTerms.length === 0) return;
    const next = [...new Set([...(customTerms || []), ...sermonTerms.map(t => normalizeTerm(t))])];
    try {
      await persistTerms(next);
      toast({ title: 'Terms added', description: `${sermonTerms.length} phrases added to approved vocabulary.` });
    } catch (err: any) {
      console.error('[MinistrySermonLibrary] addSermonTerms failed', err);
      toast({ title: 'Could not add terms', description: err.message, variant: 'destructive' });
    }
  };

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmNew, setConfirmNew] = React.useState<string[]>([]);
  const [confirmExisting, setConfirmExisting] = React.useState<string[]>([]);

  const openConfirmFor = (sermonTerms: string[]) => {
    const normalized = sermonTerms.map(t => normalizeTerm(t)).filter(Boolean);
    const existingSet = new Set((customTerms || []).map(t => normalizeTerm(t)));
    const newOnes = normalized.filter(t => !existingSet.has(t));
    const existingOnes = normalized.filter(t => existingSet.has(t));
    setConfirmNew(newOnes);
    setConfirmExisting(existingOnes);
    setConfirmOpen(true);
  };

  const retryTranscription = async (sermonId: string) => {
    try {
      await supabase.from('ministry_sermon_library').update({ status: 'pending', processing_error: null }).eq('id', sermonId);
      toast({ title: 'Retry queued', description: 'Transcription retry queued — it will be processed shortly.' });
    } catch (err: any) {
      console.error('[MinistrySermonLibrary] retry failed:', err);
      toast({ title: 'Retry failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-indigo-600" />
            Sermon Upload & Transcript
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Sermon title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday Morning Message" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Speaker</label>
              <Input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Pastor Tola" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Source</label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'upload', label: 'Upload file', Icon: UploadCloud },
                { key: 'link', label: 'Website link', Icon: Link2 },
                { key: 'youtube', label: 'YouTube link', Icon: Youtube },
              ].map(({ key, label, Icon }) => (
                <Button
                  key={key}
                  type="button"
                  variant={sourceType === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSourceType(key as 'upload' | 'link' | 'youtube')}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {sourceType === 'upload' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload sermon file</label>
              <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 bg-muted/30">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                  <UploadCloud className="h-4 w-4" />
                  Upload
                  <input type="file" accept=".txt,.md,.csv,.mp3,.wav,.m4a,.mp4,.mov,.avi,.webm" className="hidden" onChange={handleFileUpload} />
                </label>
                <span className="text-sm text-muted-foreground">{fileName || 'No file selected yet'}</span>
              </div>
            </div>
          )}

          {(sourceType === 'link' || sourceType === 'youtube') && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{sourceType === 'youtube' ? 'YouTube URL' : 'Sermon link'}</label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={sourceType === 'youtube' ? 'https://youtu.be/... or https://youtube.com/watch?...' : 'https://example.com/sermon'}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Transcript</label>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={12}
              placeholder="Paste the sermon transcript here, or upload a text file. If you're importing from a link or YouTube, you can paste the transcript manually or keep the source URL for reference."
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleSaveSermon} disabled={saving || loadingSavedData}>
              {saving ? 'Saving...' : 'Save sermon'}
            </Button>
            <Button type="button" variant="outline" onClick={handleAddExtractedTerms}>
              <Sparkles className="mr-2 h-4 w-4" />
              Add extracted terms
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Detected sermon phrases</h3>
              <Badge variant="secondary">{extractedTerms.length} found</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {extractedTerms.length > 0 ? (
                extractedTerms.map((term) => (
                  <Badge key={term} variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                    {term}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Type or paste a transcript to suggest custom sermon phrases.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Approved ministry vocabulary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {customTerms.length > 0 ? (
              customTerms.map((term) => (
                <Badge key={term} variant="secondary" className="flex items-center gap-2 rounded-full px-2.5 py-1">
                  {term}
                  <button type="button" aria-label={`Remove ${term}`} onClick={() => removeTerm(term)} className="text-muted-foreground hover:text-foreground">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No custom sermon terms yet. Save a sermon transcript and approve the phrases.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {sermons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved sermons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sermons.map((sermon) => (
              <div key={sermon.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{sermon.title}</h4>
                    <p className="text-sm text-muted-foreground">{sermon.speaker}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(sermon.createdAt).toLocaleDateString()}</span>
                </div>

                {sermon.fileName && <p className="mt-2 text-xs text-muted-foreground">Source file: {sermon.fileName}</p>}

                <div className="mt-3">
                  {sermon.transcript ? (
                    <p className="line-clamp-4 text-sm text-muted-foreground whitespace-pre-wrap">{sermon.transcript}</p>
                  ) : sermon.transcriptionPending ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                      <span>Transcription in progress…</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No transcript yet. Click Retry to queue transcription.</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {sermon.approvedTerms.map((term) => (
                      <Badge key={`${sermon.id}-${term}`} variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  {/** Show retry when there's no transcript or when an error occurred */}
                  {(!sermon.transcript || sermon.transcriptionPending) && (
                    <Button size="sm" variant="outline" onClick={() => retryTranscription(sermon.id)}>
                      Retry
                    </Button>
                  )}

                  {sermon.approvedTerms && sermon.approvedTerms.length > 0 && (
                    <>
                      <Button size="sm" onClick={() => openConfirmFor(sermon.approvedTerms)}>
                        Add terms
                      </Button>

                      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Add detected phrases</DialogTitle>
                            <DialogDescription>Review the phrases below and confirm which ones to add to the ministry's approved vocabulary.</DialogDescription>
                          </DialogHeader>

                          <div className="mt-3 space-y-3">
                            {confirmNew.length > 0 && (
                              <div>
                                <div className="text-sm font-semibold">New phrases</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {confirmNew.map((t) => (
                                    <Badge key={t} variant="secondary" className="px-2 py-1">{t}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {confirmExisting.length > 0 && (
                              <div>
                                <div className="text-sm font-semibold">Already approved</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {confirmExisting.map((t) => (
                                    <Badge key={t} variant="outline" className="px-2 py-1">{t}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                            <Button onClick={async () => {
                              setConfirmOpen(false);
                              const all = [...new Set([...(customTerms || []), ...confirmNew, ...confirmExisting])];
                              await persistTerms(all);
                              toast({ title: 'Terms added', description: `${confirmNew.length} new phrases were added.` });
                            }}>Confirm</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MinistrySermonLibrary;
