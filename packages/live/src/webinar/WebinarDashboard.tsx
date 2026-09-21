import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@rekindle/ui/dialog';
import { Loader2, Plus, Radio, Calendar, Users, Play, Copy, BarChart3, Pencil, CopyPlus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@rekindle/supabase';
import { formatMeetingTime } from '@rekindle/features/meetingTime';
import { publicAppOrigin } from '@rekindle/features/liveShare';
import RegisterMeetingButton from '../components/RegisterMeetingButton';
import { listMinistryWebinars, startWebinarNow, type MinistryWebinar, type WebinarStatus } from './webinarControl';
import { CreateWebinarWizard } from './CreateWebinarWizard';
import { WebinarAnalytics } from './WebinarAnalytics';

interface WebinarDashboardProps {
  ministryId: string;
  isLeader: boolean;
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

function WebinarCard({ webinar, ministryId, isLeader, onEdit, onChanged }: {
  webinar: MinistryWebinar; ministryId: string; isLeader: boolean;
  onEdit: (w: MinistryWebinar) => void; onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showManageConfirm, setShowManageConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const isLive = LIVE_STATUSES.includes(webinar.status);
  const openWebinar = () => navigate(`/ministry/${ministryId}/webinar/${webinar.id}`);
  // Rejoining something already live needs no confirmation; a leader opening a
  // not-yet-live webinar goes through a "Manage Webinar" confirm first
  // (2026-09-21), which itself starts the webinar (same as the webinar page's
  // own Start Webinar button) before navigating in — so confirming actually
  // begins it in one step, rather than landing on yet another Start button.
  // Attendees can't start anything either way, so they go straight through.
  const handleCardOpen = () => { if (isLive || !isLeader) openWebinar(); else setShowManageConfirm(true); };
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

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={handleCardOpen}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2">{webinar.title}</CardTitle>
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
          {isLeader && isMutable && (
            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" disabled={busy}
              onClick={(e) => { e.stopPropagation(); setShowCancelConfirm(true); }} title="Cancel">
              <Ban className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
      {isLeader && isPast && (
        <WebinarAnalytics webinar={webinar} open={showAnalytics} onClose={() => setShowAnalytics(false)} />
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
    </Card>
  );
}

/** Ministry's webinar list — mirrors MinistryInteractiveMeetings' role in the
 *  meetings tab, but scoped to ministry_webinars (a wholly separate table/UI). */
export function WebinarDashboard({ ministryId, isLeader }: WebinarDashboardProps) {
  const [webinars, setWebinars] = useState<MinistryWebinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingWebinar, setEditingWebinar] = useState<MinistryWebinar | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listMinistryWebinars(ministryId);
    setWebinars(data);
    setLoading(false);
  }, [ministryId]);

  useEffect(() => { load(); }, [load]);

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

  const renderGrid = (list: MinistryWebinar[], emptyLabel: string) => (
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
          <WebinarCard key={w.id} webinar={w} ministryId={ministryId} isLeader={isLeader} onEdit={setEditingWebinar} onChanged={load} />
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
        </TabsList>
        <TabsContent value="live">{renderGrid(live, 'No live webinars right now.')}</TabsContent>
        <TabsContent value="upcoming">{renderGrid(upcoming, 'No upcoming webinars scheduled.')}</TabsContent>
        <TabsContent value="past">{renderGrid(past, 'No past webinars yet.')}</TabsContent>
        {isLeader && <TabsContent value="drafts">{renderGrid(drafts, 'No drafts.')}</TabsContent>}
      </Tabs>

      <CreateWebinarWizard
        ministryId={ministryId}
        isOpen={showCreate || !!editingWebinar}
        webinar={editingWebinar}
        onClose={() => { setShowCreate(false); setEditingWebinar(null); }}
        onSuccess={() => { setEditingWebinar(null); load(); }}
      />
    </div>
  );
}

export default WebinarDashboard;
