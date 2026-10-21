import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { confirmAction } from '@rekindle/ui/confirm-dialog';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { formatMeetingTime } from '@rekindle/features/meetingTime';
import { BookOpen, Calendar, ExternalLink, FileText, Loader2, Pencil, Plus, Trash2, Video } from 'lucide-react';

const MinistryRecordingsTab = lazy(() => import('./MinistryRecordingsTab').then((m) => ({ default: m.MinistryRecordingsTab })));

// Ministry › Bible Study: one page per study with when it meets, how to join,
// its materials and its past recordings (ministry_study_series and
// ministry_study_materials, 0414). Members read it; leaders edit it here.

interface Series {
  id: string;
  title: string;
  description: string | null;
  schedule_text: string | null;
  join_url: string | null;
  meeting_id: string | null;
  display_order: number;
}

interface Material {
  id: string;
  series_id: string;
  title: string;
  url: string;
  session_date: string | null;
}

interface Meeting {
  id: string;
  title: string;
  scheduled_time: string | null;
  timezone: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  enable_recording: boolean;
  room_name: string;
}

interface Props {
  ministryId: string;
  canManage: boolean;
}

type SeriesDraft = Omit<Series, 'id' | 'display_order'> & { id?: string };
const emptySeries: SeriesDraft = { title: '', description: '', schedule_text: '', join_url: '', meeting_id: null };

const isHttpUrl = (u: string) => /^https?:\/\//i.test(u.trim());

export const MinistryBibleStudy: React.FC<Props> = ({ ministryId, canManage }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<Series[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeriesDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ title: '', url: '', session_date: '' });

  const load = async () => {
    setLoading(true);
    const [s, m, mt] = await Promise.all([
      supabase.from('ministry_study_series').select('id, title, description, schedule_text, join_url, meeting_id, display_order')
        .eq('ministry_id', ministryId).eq('is_active', true).order('display_order').order('created_at'),
      supabase.from('ministry_study_materials').select('id, series_id, title, url, session_date')
        .eq('ministry_id', ministryId).order('session_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('ministry_video_meetings').select('id, title, scheduled_time, timezone, duration_minutes, is_active, enable_recording, room_name')
        .eq('ministry_id', ministryId).order('created_at', { ascending: false }),
    ]);
    if (s.error) toast({ title: t('bibleStudy', 'loadFailed', 'Could not load Bible study'), description: s.error.message, variant: 'destructive' });
    const list = (s.data ?? []) as Series[];
    setSeries(list);
    setMaterials((m.data ?? []) as Material[]);
    setMeetings((mt.data ?? []) as Meeting[]);
    setActiveId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0]?.id ?? null));
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [ministryId]);

  const active = series.find((s) => s.id === activeId) ?? null;
  const meeting = active?.meeting_id ? meetings.find((m) => m.id === active.meeting_id) ?? null : null;
  const activeMaterials = useMemo(() => materials.filter((m) => m.series_id === activeId), [materials, activeId]);
  const upcoming = meeting?.scheduled_time && new Date(meeting.scheduled_time).getTime() + (meeting.duration_minutes ?? 60) * 60_000 > Date.now();

  const saveSeries = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return toast({ title: t('bibleStudy', 'titleRequired', 'Give the study a name'), variant: 'destructive' });
    if (draft.join_url && !isHttpUrl(draft.join_url)) return toast({ title: t('bibleStudy', 'badLink', 'Links must start with https://'), variant: 'destructive' });
    setSaving(true);
    const row = {
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      schedule_text: draft.schedule_text?.trim() || null,
      join_url: draft.join_url?.trim() || null,
      meeting_id: draft.meeting_id || null,
      updated_at: new Date().toISOString(),
    };
    const res = draft.id
      ? await supabase.from('ministry_study_series').update(row).eq('id', draft.id).select('id').single()
      : await supabase.from('ministry_study_series').insert({ ...row, ministry_id: ministryId, display_order: series.length * 10 }).select('id').single();
    setSaving(false);
    if (res.error) return toast({ title: t('bibleStudy', 'saveFailed', 'Could not save'), description: res.error.message, variant: 'destructive' });
    setDraft(null);
    setActiveId(res.data?.id ?? activeId);
    load();
  };

  const removeSeries = async (s: Series) => {
    if (!await confirmAction({ title: t('bibleStudy', 'deleteConfirm', 'Delete "{title}" and its materials?').replace('{title}', s.title), confirmLabel: t('bibleStudy', 'delete', 'Delete'), destructive: true })) return;
    const { error } = await supabase.from('ministry_study_series').delete().eq('id', s.id);
    if (error) return toast({ title: t('bibleStudy', 'saveFailed', 'Could not save'), description: error.message, variant: 'destructive' });
    load();
  };

  const addMaterial = async () => {
    if (!active) return;
    if (!newMaterial.title.trim() || !isHttpUrl(newMaterial.url)) {
      return toast({ title: t('bibleStudy', 'materialRequired', 'Add a title and a link starting with https://'), variant: 'destructive' });
    }
    const { error } = await supabase.from('ministry_study_materials').insert({
      series_id: active.id,
      ministry_id: ministryId,
      title: newMaterial.title.trim(),
      url: newMaterial.url.trim(),
      session_date: newMaterial.session_date || null,
    });
    if (error) return toast({ title: t('bibleStudy', 'saveFailed', 'Could not save'), description: error.message, variant: 'destructive' });
    setNewMaterial({ title: '', url: '', session_date: '' });
    load();
  };

  const removeMaterial = async (m: Material) => {
    if (!await confirmAction({ title: t('bibleStudy', 'removeMaterial', 'Remove "{title}"?').replace('{title}', m.title), confirmLabel: t('bibleStudy', 'remove', 'Remove'), destructive: true })) return;
    const { error } = await supabase.from('ministry_study_materials').delete().eq('id', m.id);
    if (error) return toast({ title: t('bibleStudy', 'saveFailed', 'Could not save'), description: error.message, variant: 'destructive' });
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t('bibleStudy', 'title', 'Bible Study')}</h2>
          <p className="text-sm text-muted-foreground">{t('bibleStudy', 'subtitle', 'When we meet, how to join, and everything you need to study along.')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setDraft({ ...emptySeries })}><Plus className="mr-1.5 h-4 w-4" />{t('bibleStudy', 'addStudy', 'Add a study')}</Button>
        )}
      </div>

      {series.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-medium">{t('bibleStudy', 'empty', 'No Bible studies yet')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManage
                ? t('bibleStudy', 'emptyLeader', 'Add a study to give your members one place for its schedule, joining link, materials and recordings.')
                : t('bibleStudy', 'emptyMember', 'Your leaders haven\'t added a Bible study here yet.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {series.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist">
              {series.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === activeId}
                  onClick={() => setActiveId(s.id)}
                  className={`rounded-full border px-4 py-1.5 text-sm ${s.id === activeId ? 'border-purple-600 bg-purple-600 text-white' : 'bg-white hover:bg-gray-50'}`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {active && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-xl">{active.title}</CardTitle>
                    {active.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{active.description}</p>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label={t('bibleStudy', 'edit', 'Edit')} onClick={() => setDraft({ ...active })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={t('bibleStudy', 'delete', 'Delete')} onClick={() => removeSeries(active)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg bg-purple-50 p-4 dark:bg-purple-950/30">
                    <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-purple-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">{t('bibleStudy', 'nextSession', 'Next session')}</p>
                      <p className="mt-0.5 text-base font-medium">
                        {upcoming && meeting?.scheduled_time
                          ? formatMeetingTime(meeting.scheduled_time, meeting.timezone)
                          : active.schedule_text || t('bibleStudy', 'noTime', 'Your leaders will share the next time soon.')}
                      </p>
                      {upcoming && active.schedule_text && <p className="text-sm text-muted-foreground">{active.schedule_text}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {meeting && (
                      <Button size="lg" onClick={() => navigate(`/ministry/${ministryId}/meeting/${meeting.id}`)}>
                        <Video className="mr-2 h-5 w-5" />
                        {meeting.is_active ? t('bibleStudy', 'joinNow', 'Join now (live)') : t('bibleStudy', 'join', 'Join the study')}
                      </Button>
                    )}
                    {active.join_url && (
                      <Button size="lg" variant={meeting ? 'outline' : 'default'} asChild>
                        <a href={active.join_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-5 w-5" />
                          {meeting ? t('bibleStudy', 'joinOther', 'Join by link') : t('bibleStudy', 'join', 'Join the study')}
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5 text-purple-600" />{t('bibleStudy', 'materials', 'Study materials')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeMaterials.length === 0 && <p className="text-sm text-muted-foreground">{t('bibleStudy', 'noMaterials', 'No materials yet.')}</p>}
                  {activeMaterials.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate font-medium">{m.title}</span>
                        {m.session_date && (
                          <span className="block text-xs text-muted-foreground">
                            {new Date(`${m.session_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </a>
                      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {canManage && (
                        <Button size="icon" variant="ghost" aria-label={t('bibleStudy', 'remove', 'Remove')} onClick={() => removeMaterial(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <div className="mt-3 grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <Input placeholder={t('bibleStudy', 'materialTitle', 'Title, e.g. "Week 3 notes"')} value={newMaterial.title} maxLength={160}
                        onChange={(e) => setNewMaterial((v) => ({ ...v, title: e.target.value }))} />
                      <Input placeholder={t('bibleStudy', 'materialUrl', 'Link to a PDF, doc or video')} value={newMaterial.url}
                        onChange={(e) => setNewMaterial((v) => ({ ...v, url: e.target.value }))} />
                      <Input type="date" aria-label={t('bibleStudy', 'sessionDate', 'Session date (optional)')} value={newMaterial.session_date}
                        onChange={(e) => setNewMaterial((v) => ({ ...v, session_date: e.target.value }))} />
                      <Button onClick={addMaterial}><Plus className="mr-1 h-4 w-4" />{t('bibleStudy', 'add', 'Add')}</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {meeting && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Video className="h-5 w-5 text-purple-600" />{t('bibleStudy', 'recordings', 'Past sessions')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                      <MinistryRecordingsTab meetings={[meeting]} />
                    </Suspense>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => { if (!v) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('bibleStudy', 'editStudy', 'Edit study') : t('bibleStudy', 'addStudy', 'Add a study')}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bs-title">{t('bibleStudy', 'name', 'Name')}</Label>
                <Input id="bs-title" value={draft.title} maxLength={120} placeholder={t('bibleStudy', 'namePlaceholder', 'e.g. Wednesday Bible Study')}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-desc">{t('bibleStudy', 'about', 'What we are studying (optional)')}</Label>
                <Textarea id="bs-desc" rows={3} value={draft.description ?? ''} maxLength={1000}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-when">{t('bibleStudy', 'when', 'When it meets')}</Label>
                <Input id="bs-when" value={draft.schedule_text ?? ''} maxLength={160} placeholder={t('bibleStudy', 'whenPlaceholder', 'e.g. Every Wednesday, 7pm')}
                  onChange={(e) => setDraft({ ...draft, schedule_text: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-meeting">{t('bibleStudy', 'meeting', 'Meeting in the app (optional)')}</Label>
                <select
                  id="bs-meeting"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.meeting_id ?? ''}
                  onChange={(e) => setDraft({ ...draft, meeting_id: e.target.value || null })}
                >
                  <option value="">{t('bibleStudy', 'noMeeting', 'None')}</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {t('bibleStudy', 'meetingHint', 'Members join it from this page, it sends the meeting\'s reminders, and its recordings show under Past sessions. Create one under Ministry › Meetings.')}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-link">{t('bibleStudy', 'link', 'Zoom or other joining link (optional)')}</Label>
                <Input id="bs-link" value={draft.join_url ?? ''} placeholder="https://"
                  onChange={(e) => setDraft({ ...draft, join_url: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t('bibleStudy', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveSeries} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('bibleStudy', 'save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryBibleStudy;
