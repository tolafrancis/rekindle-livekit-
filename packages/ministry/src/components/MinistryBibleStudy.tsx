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
import { BookOpen, Calendar, ExternalLink, FileText, Loader2, Pencil, Plus, Share2, Trash2, Users, Video } from 'lucide-react';

const MinistryRecordingsTab = lazy(() => import('./MinistryRecordingsTab').then((m) => ({ default: m.MinistryRecordingsTab })));
const CreateMeetingModal = lazy(() => import('./MinistryInteractiveMeetings').then((m) => ({ default: m.CreateMeetingModal })));

// Ministry › Bible Study: one page per study with when it meets, its Rekindle meeting,
// its materials and its past recordings (ministry_study_series and
// ministry_study_materials, 0414). Members read it; leaders edit it here.
//
// With smallGroupId it shows that small group's own studies instead, on the
// group's page (0415). A group study can follow a ministry-wide study
// (shared_from_id): the group then also sees that study's materials. On the
// ministry page, leaders share a study with small groups and see every
// group's study.

interface Series {
  id: string;
  title: string;
  description: string | null;
  schedule_text: string | null;
  meeting_id: string | null;
  display_order: number;
  small_group_id: string | null;
  shared_from_id: string | null;
}

interface GroupStudy {
  id: string;
  title: string;
  schedule_text: string | null;
  small_group_id: string;
  shared_from_id: string | null;
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
  /** Ministry page: ministry leaders. Group page: the group's leaders. */
  canManage: boolean;
  /** Show this small group's studies (on its page) instead of the ministry's. */
  smallGroupId?: string;
}

type SeriesDraft = Omit<Series, 'id' | 'display_order' | 'small_group_id'> & { id?: string };
const emptySeries: SeriesDraft = { title: '', description: '', schedule_text: '', meeting_id: null, shared_from_id: null };
const SERIES_COLUMNS = 'id, title, description, schedule_text, meeting_id, display_order, small_group_id, shared_from_id';

const isHttpUrl = (u: string) => /^https?:\/\//i.test(u.trim());

export const MinistryBibleStudy: React.FC<Props> = ({ ministryId, canManage, smallGroupId }) => {
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
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  // Ministry-wide studies: on a group page, the ones a group can follow.
  const [ministryStudies, setMinistryStudies] = useState<Series[]>([]);
  // Ministry page (leaders): the ministry's small groups and their studies.
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupStudies, setGroupStudies] = useState<GroupStudy[]>([]);
  const [sharing, setSharing] = useState<Set<string> | null>(null);
  const [savingShare, setSavingShare] = useState(false);

  const load = async () => {
    setLoading(true);
    const seriesQuery = supabase.from('ministry_study_series').select(SERIES_COLUMNS)
      .eq('ministry_id', ministryId).eq('is_active', true);
    const [s, mt, wide, sg, gs] = await Promise.all([
      (smallGroupId ? seriesQuery.eq('small_group_id', smallGroupId) : seriesQuery.is('small_group_id', null))
        .order('display_order').order('created_at'),
      supabase.from('ministry_video_meetings').select('id, title, scheduled_time, timezone, duration_minutes, is_active, enable_recording, room_name')
        .eq('ministry_id', ministryId).order('created_at', { ascending: false }),
      smallGroupId
        ? supabase.from('ministry_study_series').select(SERIES_COLUMNS).eq('ministry_id', ministryId).eq('is_active', true).is('small_group_id', null).order('display_order')
        : Promise.resolve({ data: [] as Series[] }),
      !smallGroupId && canManage
        ? supabase.from('small_groups').select('id, name').eq('ministry_id', ministryId).eq('status', 'active').order('name')
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      !smallGroupId && canManage
        ? supabase.from('ministry_study_series').select('id, title, schedule_text, small_group_id, shared_from_id').eq('ministry_id', ministryId).eq('is_active', true).not('small_group_id', 'is', null)
        : Promise.resolve({ data: [] as GroupStudy[] }),
    ]);
    if (s.error) toast({ title: t('bibleStudy', 'loadFailed', 'Could not load Bible study'), description: s.error.message, variant: 'destructive' });
    const list = (s.data ?? []) as Series[];
    // A group study shows its own materials and those of the study it follows.
    const seriesIds = [...new Set(list.flatMap((x) => [x.id, x.shared_from_id]).filter((id): id is string => !!id))];
    const m = seriesIds.length
      ? await supabase.from('ministry_study_materials').select('id, series_id, title, url, session_date')
        .in('series_id', seriesIds).order('session_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      : { data: [] as Material[] };
    setSeries(list);
    setMaterials((m.data ?? []) as Material[]);
    setMeetings((mt.data ?? []) as Meeting[]);
    setMinistryStudies((wide.data ?? []) as Series[]);
    setGroups((sg.data ?? []) as { id: string; name: string }[]);
    setGroupStudies((gs.data ?? []) as GroupStudy[]);
    setActiveId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0]?.id ?? null));
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [ministryId, smallGroupId]);

  const active = series.find((s) => s.id === activeId) ?? null;
  const followed = active?.shared_from_id ? ministryStudies.find((s) => s.id === active.shared_from_id) ?? null : null;
  const meeting = active?.meeting_id ? meetings.find((m) => m.id === active.meeting_id) ?? null : null;
  const activeMaterials = useMemo(
    () => materials.filter((m) => m.series_id === activeId || (!!active?.shared_from_id && m.series_id === active.shared_from_id)),
    [materials, activeId, active?.shared_from_id],
  );
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? t('bibleStudy', 'aGroup', 'A small group');
  const sharedWith = useMemo(
    () => new Set(groupStudies.filter((g) => g.shared_from_id === activeId).map((g) => g.small_group_id)),
    [groupStudies, activeId],
  );
  const upcoming = meeting?.scheduled_time && new Date(meeting.scheduled_time).getTime() + (meeting.duration_minutes ?? 60) * 60_000 > Date.now();

  const saveSeries = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return toast({ title: t('bibleStudy', 'titleRequired', 'Give the study a name'), variant: 'destructive' });
    setSaving(true);
    const row = {
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      schedule_text: draft.schedule_text?.trim() || null,
      // Members join through the study's Rekindle meeting.
      meeting_id: draft.meeting_id || null,
      ...(smallGroupId ? { shared_from_id: draft.shared_from_id || null } : {}),
      updated_at: new Date().toISOString(),
    };
    const res = draft.id
      ? await supabase.from('ministry_study_series').update(row).eq('id', draft.id).select('id').single()
      : await supabase.from('ministry_study_series')
        .insert({ ...row, ministry_id: ministryId, small_group_id: smallGroupId ?? null, display_order: series.length * 10 })
        .select('id').single();
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

  // Ministry page: give each chosen small group its own copy of the study to
  // follow. Each group's leaders then add their own time and meeting.
  const saveShare = async () => {
    if (!active || !sharing) return;
    const rows = [...sharing].filter((id) => !sharedWith.has(id)).map((groupId) => ({
      ministry_id: ministryId,
      small_group_id: groupId,
      shared_from_id: active.id,
      title: active.title,
    }));
    if (rows.length) {
      setSavingShare(true);
      const { error } = await supabase.from('ministry_study_series').insert(rows);
      setSavingShare(false);
      if (error) return toast({ title: t('bibleStudy', 'saveFailed', 'Could not save'), description: error.message, variant: 'destructive' });
      toast({
        title: t('bibleStudy', 'shared', 'Shared with {count} groups').replace('{count}', String(rows.length)),
        description: t('bibleStudy', 'sharedBody', 'Each group\'s leaders can now add their own time and meeting.'),
      });
    }
    setSharing(null);
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

  // A group page shows nothing to members until their leaders set a study up.
  if (smallGroupId && series.length === 0 && !canManage) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {smallGroupId ? (
            <h3 className="text-lg font-semibold">{t('bibleStudy', 'title', 'Bible Study')}</h3>
          ) : (
            <>
              <h2 className="text-2xl font-bold">{t('bibleStudy', 'title', 'Bible Study')}</h2>
              <p className="text-sm text-muted-foreground">{t('bibleStudy', 'subtitle', 'When we meet, how to join, and everything you need to study along.')}</p>
            </>
          )}
        </div>
        {canManage && (series.length > 0 || !smallGroupId) && (
          <Button size={smallGroupId ? 'sm' : 'default'} variant={smallGroupId ? 'outline' : 'default'} onClick={() => setDraft({ ...emptySeries })}>
            <Plus className="mr-1.5 h-4 w-4" />{t('bibleStudy', 'addStudy', 'Add a study')}
          </Button>
        )}
      </div>

      {series.length === 0 && smallGroupId ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div className="flex min-w-0 items-start gap-3">
              <BookOpen className="mt-0.5 h-6 w-6 shrink-0 text-purple-600" />
              <div className="min-w-0">
                <p className="font-medium">{t('bibleStudy', 'groupEmpty', 'Set up a Bible study for this group')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('bibleStudy', 'groupEmptyBody', 'Give your members one place for when you meet, the meeting link, materials and recordings. Optional.')}
                </p>
              </div>
            </div>
            <Button onClick={() => setDraft({ ...emptySeries })}><Plus className="mr-1.5 h-4 w-4" />{t('bibleStudy', 'setUp', 'Set it up')}</Button>
          </CardContent>
        </Card>
      ) : series.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-medium">{t('bibleStudy', 'empty', 'No Bible studies yet')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManage
                ? t('bibleStudy', 'emptyLeader', 'Add a study to give your members one place for its schedule, meeting, materials and recordings.')
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
                    {followed && followed.title !== active.title && (
                      <p className="mt-0.5 text-xs font-medium text-purple-700">{t('bibleStudy', 'follows', 'Part of {title}').replace('{title}', followed.title)}</p>
                    )}
                    {(active.description || followed?.description) && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{active.description || followed?.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      {!smallGroupId && groups.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setSharing(new Set(sharedWith))}>
                          <Share2 className="mr-1.5 h-4 w-4" />{t('bibleStudy', 'share', 'Share with small groups')}
                        </Button>
                      )}
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
                  {meeting ? (
                    <Button size="lg" onClick={() => navigate(`/ministry/${ministryId}/meeting/${meeting.id}`)}>
                      <Video className="mr-2 h-5 w-5" />
                      {meeting.is_active ? t('bibleStudy', 'joinNow', 'Join now (live)') : t('bibleStudy', 'join', 'Join the study')}
                    </Button>
                  ) : null}
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
                      {canManage && m.series_id === active.id && (
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

      {!smallGroupId && canManage && groupStudies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-purple-600" />{t('bibleStudy', 'groupStudies', 'Small group studies')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groupStudies
              .slice()
              .sort((a, b) => groupName(a.small_group_id).localeCompare(groupName(b.small_group_id)))
              .map((g) => (
                <div key={g.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{groupName(g.small_group_id)}</span>
                    <span className="text-muted-foreground"> · {g.title}</span>
                  </span>
                  <span className={`text-sm ${g.schedule_text ? 'text-muted-foreground' : 'text-amber-700'}`}>
                    {g.schedule_text || t('bibleStudy', 'noTimeYet', 'No time set yet')}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!sharing} onOpenChange={(v) => { if (!v) setSharing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bibleStudy', 'shareTitle', 'Share "{title}" with small groups').replace('{title}', active?.title ?? '')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('bibleStudy', 'shareBody', 'Each group gets this study and its materials on its own page. Their leaders add when they meet and their meeting.')}
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {groups.map((g) => {
              const already = sharedWith.has(g.id);
              const on = already || !!sharing?.has(g.id);
              return (
                <label key={g.id} className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm ${already ? 'opacity-60' : 'hover:bg-muted/60'}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-purple-600"
                    checked={on}
                    disabled={already}
                    onChange={(e) => setSharing((prev) => {
                      const next = new Set(prev ?? []);
                      if (e.target.checked) next.add(g.id); else next.delete(g.id);
                      return next;
                    })}
                  />
                  <span className="flex-1">{g.name}</span>
                  {already && <span className="text-xs text-muted-foreground">{t('bibleStudy', 'alreadyShared', 'Already has it')}</span>}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSharing(null)}>{t('bibleStudy', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveShare} disabled={savingShare || ![...(sharing ?? [])].some((id) => !sharedWith.has(id))}>
              {savingShare && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('bibleStudy', 'shareSave', 'Share')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!draft && !creatingMeeting} onOpenChange={(v) => { if (!v) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('bibleStudy', 'editStudy', 'Edit study') : t('bibleStudy', 'addStudy', 'Add a study')}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              {smallGroupId && ministryStudies.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="bs-follow">{t('bibleStudy', 'followLabel', 'Follow a study from your ministry (optional)')}</Label>
                  <select
                    id="bs-follow"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.shared_from_id ?? ''}
                    onChange={(e) => {
                      const parent = ministryStudies.find((s) => s.id === e.target.value);
                      setDraft({ ...draft, shared_from_id: parent?.id ?? null, title: draft.title.trim() ? draft.title : parent?.title ?? '' });
                    }}
                  >
                    <option value="">{t('bibleStudy', 'ownStudy', 'No, our own study')}</option>
                    {ministryStudies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">{t('bibleStudy', 'followHint', 'Your group sees that study\'s materials too.')}</p>
                </div>
              )}
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
                <Label htmlFor="bs-meeting">{t('bibleStudy', 'meeting', 'Rekindle meeting')}</Label>
                <select
                  id="bs-meeting"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.meeting_id ?? ''}
                  onChange={(e) => setDraft({ ...draft, meeting_id: e.target.value || null })}
                >
                  <option value="">{t('bibleStudy', 'pickMeeting', 'Choose a meeting')}</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {t('bibleStudy', 'meetingHint', 'Members join it from this page, it sends the meeting\'s reminders, and its recordings show under Past sessions.')}
                  {' '}
                  <button type="button" className="font-medium text-purple-700 underline" onClick={() => setCreatingMeeting(true)}>
                    {t('bibleStudy', 'createMeeting', 'Create a new meeting')}
                  </button>
                </p>
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

      {creatingMeeting && (
        <Suspense fallback={null}>
          <CreateMeetingModal
            isOpen
            ministryId={ministryId}
            onClose={() => setCreatingMeeting(false)}
            onSuccess={(created) => {
              // Pick the new meeting for the study being edited.
              setMeetings((prev) => [created as unknown as Meeting, ...prev]);
              setDraft((d) => (d ? { ...d, meeting_id: created.id } : d));
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default MinistryBibleStudy;
