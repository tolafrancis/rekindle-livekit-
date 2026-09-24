import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@rekindle/ui/dialog';
import { Loader2, Plus, Radio, Calendar, Users, Play, Copy, BarChart3, Pencil, CopyPlus, Ban, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@rekindle/supabase';
import { Checkbox } from '@rekindle/ui/checkbox';
import { formatMeetingTime } from '@rekindle/features/meetingTime';
import { publicAppOrigin } from '@rekindle/features/liveShare';
import RegisterMeetingButton from '../components/RegisterMeetingButton';
import { MeetingParticipantsPanel } from '../components/MeetingParticipantsPanel';
import { listMinistryWebinars, startWebinarNow, type MinistryWebinar, type WebinarStatus } from './webinarControl';
import { CreateWebinarWizard } from './CreateWebinarWizard';
import { WebinarAnalytics } from './WebinarAnalytics';

interface WebinarDashboardProps {
  ministryId: string;
  isLeader: boolean;
  /** Renders a "Recordings" tab when provided — injected by the caller
   *  (packages/ministry's MinistrySpace.tsx) with MinistryRecordingsTab,
   *  since packages/live can't depend on packages/ministry directly. */
  renderRecordingsTab?: (webinars: MinistryWebinar[]) => React.ReactNode;
}

const LIVE_STATUSES: WebinarStatus[] = ['live', 'ending', 'starting_soon'];
const UPCOMING_STATUSES: WebinarStatus[] = ['scheduled', 'registration_open'];
const PAST_STATUSES: WebinarStatus[] = ['ended', 'recording_processing', 'completed', 'cancelled'];
// Editable/cancellable up to the moment a webinar actually goes live —
// once it's live, ending, or already over, those settings are locked in.
const MUTABLE_STATUSES: WebinarStatus[] = ['draft', 'scheduled', 'registration_open'];

const statusBadge: Record<string, string> = {
  live: 'bg-red-50 text-red-700 border-red-200',
  ending: 'bg-red-50 text-red-700 border-red-200',
  starting_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  registration_open: 'bg-blue-50 text-blue-700 border-blue-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  ended: 'bg-gray-100 text-gray-600 border-gray-200',
  recording_processing: 'bg-gray-100 text-gray-600 border-gray-200',
  completed: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-gray-100 text-gray-400 border-gray-200',
};

function WebinarCard({ webinar, ministryId, isLeader, onEdit, onChanged, selectable, selected, onToggleSelect }: {
  webinar: MinistryWebinar; ministryId: string; isLeader: boolean;
  onEdit: (w: MinistryWebinar) => void; onChanged: () => void;
  /** Past tab only (2026-09-23) — shows a selection checkbox for bulk delete,
   *  driven by the parent WebinarDashboard (selection state has to live above
   *  a single card since bulk delete acts across many). */
  selectable?: boolean; selected?: boolean; onToggleSelect?: () => void;
}) {
  const navigate = useNavigate();
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showManageConfirm, setShowManageConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const isLive = LIVE_STATUSES.includes(webinar.status);
  const openWebinar = () => navigate(`/ministry/${ministryId}/webinar/${webinar.id}`);
  // Rejoining something already live needs no confirmation; a leader opening a
  // not-yet-live webinar goes through a "Manage Webinar" confirm first
  // (2026-09-21), which itself starts the webinar (same as the webinar page's
  // own Start Webinar button) before navigating in — so confirming actually
  // begins it in one step, rather than landing on yet another Start button.
  // Attendees can't start anything either way, so they go straight through.
  // In selection mode (bulk delete), a card click toggles selection instead
  // of navigating — same reasoning as any bulk-select list.
  const handleCardOpen = () => {
    if (selectable) { onToggleSelect?.(); return; }
    if (isLive || !isLeader) openWebinar(); else setShowManageConfirm(true);
  };
  const [starting, setStarting] = useState(false);
  // Root cause of "Start Webinar doesn't drop into the call" (found live,
  // 2026-09-22, via a history.pushState/replaceState interceptor + full
  // console trace): Dialog (packages/ui/src/dialog.tsx) pushes a history
  // entry while open so the browser Back button closes it instead of
  // navigating away (packages/ui/src/modal-stack.ts), and closing it queues
  // a SELF-INFLICTED history.back() that resolves asynchronously on the next
  // popstate. Calling openWebinar() (navigate(), a synchronous pushState)
  // immediately after setShowManageConfirm(false) raced that pending back():
  // our new /ministry/.../webinar/... entry landed on top BEFORE the modal's
  // own back() fired, so that back() popped OUR entry instead, bouncing
  // straight back to '/' — confirmed via TRUE MOUNT immediately followed by
  // TRUE UNMOUNT with no pushState/replaceState logged for the trip back
  // (proving it was a popstate-driven back(), not a route change). Waiting
  // for that real popstate (or a safety timeout, in case this dialog wasn't
  // registered as a modal for some reason) before navigating fixes it.
  const waitForModalCloseHistoryOp = () => new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', onPop);
      resolve();
    };
    const onPop = () => finish();
    window.addEventListener('popstate', onPop);
    setTimeout(finish, 300);
  });
  const handleConfirmManage = async () => {
    setStarting(true);
    try {
      await startWebinarNow(webinar.id);
      setShowManageConfirm(false);
      await waitForModalCloseHistoryOp();
      openWebinar();
    } catch (err) {
      console.error('[WebinarDashboard] start failed:', err);
      toast.error("Couldn't start the webinar.");
    } finally {
      setStarting(false);
    }
  };
  const copyLink = async () => {
    const link = `${publicAppOrigin()}/ministry/${ministryId}/webinar/${webinar.id}`;
    await navigator.clipboard.writeText(link);
    toast.success('Webinar link copied');
  };
  const isPast = PAST_STATUSES.includes(webinar.status);
  const isMutable = MUTABLE_STATUSES.includes(webinar.status);

  const duplicate = async () => {
    setBusy(true);
    try {
      const roomName = `webinar-${ministryId}-${Date.now()}`;
      const { error } = await supabase.from('ministry_webinars').insert({
        ministry_id: webinar.ministry_id,
        host_id: webinar.host_id,
        room_name: roomName,
        status: 'draft',
        title: `${webinar.title} (copy)`,
        description: webinar.description,
        cover_image_url: webinar.cover_image_url,
        scheduled_start_at: null,
        timezone: webinar.timezone,
        duration_minutes: webinar.duration_minutes,
        max_attendees: webinar.max_attendees,
        registration_required: webinar.registration_required,
        reminder_offsets: [],
        is_public: webinar.is_public,
        access_level: webinar.access_level,
        enable_recording: webinar.enable_recording,
        enable_chat: webinar.enable_chat,
        enable_qa: webinar.enable_qa,
        enable_polls: webinar.enable_polls,
        enable_reactions: webinar.enable_reactions,
        enable_captions: webinar.enable_captions,
        enable_translation: webinar.enable_translation,
        default_language: webinar.default_language,
        ...(webinar.source_language && webinar.source_language !== 'en' ? { source_language: webinar.source_language } : {}),
      });
      if (error) throw error;
      toast.success('Duplicated as a new draft');
      onChanged();
    } catch (err) {
      console.error('[WebinarDashboard] duplicate failed:', err);
      toast.error('Could not duplicate this webinar');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from('ministry_webinars').update({ status: 'cancelled' }).eq('id', webinar.id);
      if (error) throw error;
      toast.success('Webinar cancelled');
      setShowCancelConfirm(false);
      onChanged();
    } catch (err) {
      console.error('[WebinarDashboard] cancel failed:', err);
      toast.error('Could not cancel this webinar');
    } finally {
      setBusy(false);
    }
  };

  // Real request (2026-09-23): past webinars had no delete path at all —
  // junk/test entries (and anything a host genuinely wants gone) just
  // accumulated forever. Goes through livekit-egress's delete-webinar action
  // rather than a plain table delete (unlike Interactive Meetings' own
  // handleDeleteMeeting) because a webinar's recording is a real S3/R2 file
  // that needs removing too, plus several other tables (attendance, chat,
  // translation sessions) reference it without a formal foreign key.
  const deleteWebinar = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('livekit-egress', {
        body: { action: 'delete-webinar', webinarId: webinar.id },
      });
      if (error || (data as { error?: string } | null)?.error) {
        throw new Error((data as { error?: string } | null)?.error || error?.message || 'Delete failed');
      }
      toast.success('Webinar deleted');
      setShowDeleteConfirm(false);
      onChanged();
    } catch (err) {
      console.error('[WebinarDashboard] delete failed:', err);
      toast.error('Could not delete this webinar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer ${selected ? 'ring-2 ring-purple-500' : ''}`}
      onClick={handleCardOpen}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {selectable && (
              <Checkbox
                checked={!!selected}
                onCheckedChange={() => onToggleSelect?.()}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 shrink-0"
              />
            )}
            <CardTitle className="text-base line-clamp-2">{webinar.title}</CardTitle>
          </div>
          <Badge variant="outline" className={statusBadge[webinar.status] || 'bg-gray-100 text-gray-600'}>
            {webinar.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        {webinar.description && <CardDescription className="line-clamp-2">{webinar.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">
        {webinar.scheduled_start_at && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> {formatMeetingTime(webinar.scheduled_start_at, webinar.timezone)}
          </p>
        )}
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Up to {webinar.max_attendees} attendees
          {webinar.attendee_count > 0 ? ` · ${webinar.attendee_count} attended` : ''}
        </p>
        {/* Hidden entirely while in selection mode (2026-09-23, real bug:
            clicking "Manage Webinar" was toggling selection instead of
            opening the webinar, since every click routed through the same
            handleCardOpen). Selection is opt-in and mutually exclusive with
            normal card actions — while picking webinars to bulk-delete,
            there's nothing else to do with an individual card here. */}
        {!selectable && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={(e) => { e.stopPropagation(); handleCardOpen(); }}>
              {isLive ? <><Play className="h-3.5 w-3.5 mr-1" /> Join</> : isLeader ? 'Manage Webinar' : 'View'}
            </Button>
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); copyLink(); }} title="Copy link">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {isLeader && isMutable && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onEdit(webinar); }} title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {isLeader && (
              <Button size="sm" variant="outline" disabled={busy} onClick={(e) => { e.stopPropagation(); duplicate(); }} title="Duplicate">
                <CopyPlus className="h-3.5 w-3.5" />
              </Button>
            )}
            {isLeader && webinar.registration_required && (
              <div onClick={(e) => e.stopPropagation()}>
                <RegisterMeetingButton meetingId={webinar.id} meetingKind="webinar" meetingTitle={webinar.title} isHost />
              </div>
            )}
            {isLeader && isPast && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setShowAnalytics(true); }} title="Analytics">
                <BarChart3 className="h-3.5 w-3.5" />
              </Button>
            )}
            {isLeader && isPast && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setShowParticipants(true); }} title="Participants">
                <Users className="h-3.5 w-3.5" />
              </Button>
            )}
            {isLeader && isMutable && (
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" disabled={busy}
                onClick={(e) => { e.stopPropagation(); setShowCancelConfirm(true); }} title="Cancel">
                <Ban className="h-3.5 w-3.5" />
              </Button>
            )}
            {isLeader && isPast && (
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" disabled={deleting}
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }} title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {isLeader && isPast && (
        <WebinarAnalytics webinar={webinar} open={showAnalytics} onClose={() => setShowAnalytics(false)} />
      )}
      {/* Real per-attendee list (name, join/leave time) — same panel
          Interactive Meetings uses, reused as-is via meetingKind=
          "ministry_webinar" (already a supported MeetingKind). Distinct from
          WebinarAnalytics' "Registrants" table above, which is registrant-
          anchored and only shows when registration_required was on; this
          shows actual attendance regardless. */}
      {isLeader && isPast && (
        <MeetingParticipantsPanel
          meetingId={webinar.id}
          open={showParticipants}
          onClose={() => setShowParticipants(false)}
          meetingKind="ministry_webinar"
        />
      )}
      <Dialog open={showManageConfirm} onOpenChange={(open) => { if (!starting) setShowManageConfirm(open); }}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Start {webinar.title}?</DialogTitle>
            <DialogDescription>This starts the webinar now — attendees will be able to join. Is this correct?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={starting} onClick={(e) => { e.stopPropagation(); setShowManageConfirm(false); }}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" disabled={starting} onClick={(e) => { e.stopPropagation(); handleConfirmManage(); }}>
              {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {starting ? 'Starting…' : 'Start Webinar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isLeader && (
        <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Cancel this webinar?</DialogTitle>
              <DialogDescription>Attendees and registrants won't be able to join. This can't be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={(e) => { e.stopPropagation(); setShowCancelConfirm(false); }}>Keep it</Button>
              <Button className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={(e) => { e.stopPropagation(); cancel(); }}>
                Cancel webinar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isLeader && isPast && (
        <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!deleting) setShowDeleteConfirm(open); }}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Delete "{webinar.title}"?</DialogTitle>
              <DialogDescription>
                Permanently deletes this webinar, its recording, chat, attendance, and analytics. This can't be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={deleting} onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}>Keep it</Button>
              <Button className="bg-red-600 hover:bg-red-700" disabled={deleting} onClick={(e) => { e.stopPropagation(); deleteWebinar(); }}>
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {deleting ? 'Deleting…' : 'Delete webinar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

/** Ministry's webinar list — mirrors MinistryInteractiveMeetings' role in the
 *  meetings tab, but scoped to ministry_webinars (a wholly separate table/UI). */
export function WebinarDashboard({ ministryId, isLeader, renderRecordingsTab }: WebinarDashboardProps) {
  const [webinars, setWebinars] = useState<MinistryWebinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingWebinar, setEditingWebinar] = useState<MinistryWebinar | null>(null);

  // Multi-select bulk delete for the Past tab (2026-09-23, real request) —
  // selection lives here rather than per-card since it acts across many
  // cards at once. Cleared whenever the underlying list reloads (a deleted
  // id wouldn't be in the fresh list anyway, and stale selection across a
  // reload is more confusing than starting clean).
  //
  // Real bug found live (2026-09-23): selection used to be always-on for
  // every past card, so a click on "Manage Webinar" (which routes through
  // the same card-click handler) toggled selection instead of opening the
  // webinar — the host couldn't click into a past webinar at all. Selection
  // is now opt-in: selectMode starts false, cards behave exactly like any
  // other tab until a leader explicitly turns it on.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Real bug found live (2026-09-23): a test bulk-delete of 9 webinars
  // looked hung — it wasn't (the DB count kept dropping in the background),
  // it was just slow with zero progress feedback, since each webinar's
  // recording can have dozens of HLS segment files each needing its own S3
  // delete call (fixed to run concurrently server-side — see deletePrefix's
  // own comment). Tracking progress here too so this can never look stuck
  // again even if a particular webinar's cleanup is genuinely slow.
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState(0);
  const toggleSelected = (id: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fetchWebinars = useCallback(async () => {
    const data = await listMinistryWebinars(ministryId);
    setWebinars(data);
  }, [ministryId]);

  const load = useCallback(async () => {
    setLoading(true);
    await fetchWebinars();
    setSelectedForDelete(new Set());
    setLoading(false);
  }, [fetchWebinars]);

  useEffect(() => { load(); }, [load]);

  // Real bug reported live (2026-09-23): "when a webinar ends and i go back
  // home its always still display in live... until i refresh." This list was
  // only ever fetched once on mount — status changes made elsewhere (ending
  // a webinar from WebinarStage.tsx, another host's action, a webhook)
  // never reached an already-mounted dashboard, so it showed a stale
  // snapshot indefinitely until something forced a remount or a hard
  // refresh. Same postgres_changes pattern already used for e.g.
  // TranslationListenerButton.tsx's session list — a quiet background
  // refetch (fetchWebinars, not load) so this never flashes the full-grid
  // loading spinner just because some webinar's status changed.
  useEffect(() => {
    const channel = supabase
      .channel(`webinar-dashboard-${ministryId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ministry_webinars', filter: `ministry_id=eq.${ministryId}` },
        () => { fetchWebinars(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ministryId, fetchWebinars]);

  // Same delete-webinar action the single-card Delete button uses. Bounded
  // concurrency (a few at a time), not fully sequential and not unbounded
  // Promise.all — each call does its own real S3 cleanup work server-side,
  // so some overlap meaningfully speeds up a multi-webinar delete without
  // firing an unbounded burst at the edge function.
  const BULK_DELETE_CONCURRENCY = 3;
  const bulkDelete = async () => {
    setBulkDeleting(true);
    setBulkDeleteProgress(0);
    const ids = [...selectedForDelete];
    let failed = 0;
    let completed = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        const { data, error } = await supabase.functions.invoke('livekit-egress', {
          body: { action: 'delete-webinar', webinarId: id },
        });
        if (error || (data as { error?: string } | null)?.error) failed++;
        completed++;
        setBulkDeleteProgress(completed);
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_DELETE_CONCURRENCY, ids.length) }, worker));
    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
    setSelectMode(false);
    if (failed > 0) toast.error(`${failed} webinar(s) could not be deleted`);
    else toast.success('Webinars deleted');
    load();
  };

  const live = webinars.filter((w) => LIVE_STATUSES.includes(w.status));
  // Leaders also see their drafts under Upcoming (2026-09-21): creating a
  // webinar with no scheduled date/time saves it as 'draft' — meant for
  // "start it right now" — and it was only reachable via the separate Drafts
  // tab, so a newly created start-now webinar appeared to vanish after
  // saving. Members never see drafts here (or at all) — they're unfinished/
  // unannounced, unlike 'scheduled', which is an intentional announcement.
  const upcoming = webinars.filter((w) => UPCOMING_STATUSES.includes(w.status) || (isLeader && w.status === 'draft'));
  const past = webinars.filter((w) => PAST_STATUSES.includes(w.status));
  const drafts = webinars.filter((w) => w.status === 'draft');

  const renderGrid = (list: MinistryWebinar[], emptyLabel: string, selectable = false) => (
    loading ? (
      <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /></div>
    ) : list.length === 0 ? (
      <div className="text-center py-12 text-gray-400">
        <Radio className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>{emptyLabel}</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((w) => (
          <WebinarCard
            key={w.id} webinar={w} ministryId={ministryId} isLeader={isLeader} onEdit={setEditingWebinar} onChanged={load}
            selectable={selectable}
            selected={selectedForDelete.has(w.id)}
            onToggleSelect={() => toggleSelected(w.id)}
          />
        ))}
      </div>
    )
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Radio className="h-6 w-6 text-purple-600" /> Webinars</h2>
          <p className="text-sm text-gray-500">Host/speakers broadcast to an audience, with controlled audience interaction.</p>
        </div>
        {isLeader && (
          <Button onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 mr-2" /> New webinar
          </Button>
        )}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="live">Live{live.length > 0 ? ` (${live.length})` : ''}</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          {isLeader && <TabsTrigger value="drafts">Drafts</TabsTrigger>}
          {renderRecordingsTab && <TabsTrigger value="recordings">Recordings</TabsTrigger>}
        </TabsList>
        <TabsContent value="live">{renderGrid(live, 'No live webinars right now.')}</TabsContent>
        <TabsContent value="upcoming">{renderGrid(upcoming, 'No upcoming webinars scheduled.')}</TabsContent>
        <TabsContent value="past">
          {isLeader && past.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              {selectMode ? (
                <p className="text-xs text-gray-500">
                  {selectedForDelete.size > 0 ? `${selectedForDelete.size} selected` : 'Tap webinars to select them'}
                </p>
              ) : <span />}
              <div className="flex gap-2">
                {selectMode && selectedForDelete.size > 0 && (
                  <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowBulkDeleteConfirm(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete {selectedForDelete.size}
                  </Button>
                )}
                <Button
                  size="sm" variant="outline"
                  onClick={() => { setSelectMode((v) => !v); setSelectedForDelete(new Set()); }}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </Button>
              </div>
            </div>
          )}
          {renderGrid(past, 'No past webinars yet.', selectMode)}
        </TabsContent>
        {isLeader && <TabsContent value="drafts">{renderGrid(drafts, 'No drafts.')}</TabsContent>}
        {/* Same shared recordings library Interactive Meetings uses
            (MinistryRecordingsTab, in packages/ministry — injected from
            MinistrySpace.tsx since packages/live can't depend on
            packages/ministry). livekit-egress's list-recordings action
            enforces recording_visibility server-side for webinar rows, so a
            regular member here simply won't see private ones back; no extra
            filtering needed here. */}
        {renderRecordingsTab && <TabsContent value="recordings">{renderRecordingsTab(webinars)}</TabsContent>}
      </Tabs>

      <CreateWebinarWizard
        ministryId={ministryId}
        isOpen={showCreate || !!editingWebinar}
        webinar={editingWebinar}
        onClose={() => { setShowCreate(false); setEditingWebinar(null); }}
        onSuccess={() => { setEditingWebinar(null); load(); }}
      />

      <Dialog open={showBulkDeleteConfirm} onOpenChange={(open) => { if (!bulkDeleting) setShowBulkDeleteConfirm(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedForDelete.size} webinar{selectedForDelete.size === 1 ? '' : 's'}?</DialogTitle>
            <DialogDescription>
              Permanently deletes each selected webinar, its recording, chat, attendance, and analytics. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          {/* Real gap found live: this used to just say "Deleting…" with no
              sense of progress, so a slow multi-webinar delete (each one's
              recording can have many S3 segment files to clean up) looked
              stuck even while it was actively working through the list. */}
          {bulkDeleting && (
            <p className="text-sm text-gray-500">Deleting {bulkDeleteProgress} of {selectedForDelete.size}…</p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={bulkDeleting} onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={bulkDeleting} onClick={bulkDelete}>
              {bulkDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {bulkDeleting ? `Deleting ${bulkDeleteProgress}/${selectedForDelete.size}…` : `Delete ${selectedForDelete.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WebinarDashboard;
