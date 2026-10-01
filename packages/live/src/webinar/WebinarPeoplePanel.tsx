import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Hand, MicOff, Sparkles, ShieldCheck, ShieldOff, ArrowDownToLine, UserPlus } from 'lucide-react';
import type { ModeratorControls } from '../components/DailyVideoCall';
import type { PresenceMember } from '../useMeetingPresence';
import type { useWebinarSpeakerRequests } from './useWebinarSpeakerRequests';
import { setWebinarCoHost, moveWebinarSpeakerToAudience, type MinistryWebinar } from './webinarControl';

interface WebinarPeoplePanelProps {
  webinar: MinistryWebinar;
  userId: string;
  /** Only the webinar's own host can make or remove co-hosts. */
  isHost: boolean;
  controls: ModeratorControls | null;
  speakerRequests: ReturnType<typeof useWebinarSpeakerRequests>;
  presenceMembers: PresenceMember[];
}

const ROLE_LABEL: Record<string, string> = { host: 'Host', 'co-host': 'Co-host' };

/** Manage → People: everyone on stage with their controls (mute, spotlight,
 *  co-host, back to the audience), then the audience with a way to bring
 *  anyone up to speak. On-stage people come from the LiveKit room itself
 *  (DailyVideoCall's onModeratorControlsChange); the audience comes from the
 *  realtime presence channel WebinarAttendeeViewer announces into. */
export function WebinarPeoplePanel({
  webinar, userId, isHost, controls, speakerRequests, presenceMembers,
}: WebinarPeoplePanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const onStage = controls?.participants ?? [];
  const onStageIds = new Set(onStage.map((p) => p.id));
  const audience = presenceMembers.filter((m) => m.userId !== userId && !onStageIds.has(m.userId));
  const invitedIds = new Set(speakerRequests.requests.filter((r) => r.status === 'invited').map((r) => r.user_id));
  const requestedIds = new Set(speakerRequests.pendingRequests.map((r) => r.user_id));
  // Requests from people who aren't in the presence list right now (a flaky
  // connection drops presence first) still need answering.
  const orphanRequests = speakerRequests.pendingRequests.filter(
    (r) => !audience.some((m) => m.userId === r.user_id) && !onStageIds.has(r.user_id),
  );

  const run = async (id: string, fn: () => Promise<void>, failMessage: string) => {
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      console.error('[WebinarPeoplePanel]', failMessage, err);
      toast.error(failMessage);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-300">On stage ({onStage.length})</p>
          {controls && onStage.some((p) => !p.isLocal && p.hasAudio) && (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-gray-300 hover:text-white" onClick={controls.muteAll}>
              <MicOff className="h-4 w-4 mr-1" /> Mute all
            </Button>
          )}
        </div>
        {!controls ? (
          <p className="text-sm text-gray-500">Connecting…</p>
        ) : (
          <div className="space-y-3">
            {onStage.map((p) => {
              const spotlit = controls.spotlightIds.includes(p.id);
              const isTargetHost = p.id === webinar.host_id || p.role === 'host';
              const isCoHost = p.role === 'co-host';
              const busy = busyId === p.id;
              return (
                <div key={p.id} className="rounded-md bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{p.name}{p.isLocal ? ' (you)' : ''}</span>
                    {ROLE_LABEL[isTargetHost ? 'host' : p.role] && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-white/20 text-gray-300">
                        {ROLE_LABEL[isTargetHost ? 'host' : p.role]}
                      </Badge>
                    )}
                    {spotlit && <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {!p.isLocal && (
                      <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" disabled={!p.hasAudio}
                        onClick={() => controls.mute(p.id)}>
                        <MicOff className="h-3.5 w-3.5 mr-1" /> {p.hasAudio ? 'Mute' : 'Muted'}
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
                      onClick={() => (spotlit ? controls.removeSpotlight(p.id) : controls.spotlight(p.id))}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> {spotlit ? 'Remove spotlight' : 'Spotlight'}
                    </Button>
                    {isHost && !p.isLocal && !isTargetHost && (
                      <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" disabled={busy}
                        onClick={() => run(p.id, () => setWebinarCoHost({
                          webinarId: webinar.id, roomName: webinar.room_name, userId: p.id, userName: p.name, coHost: !isCoHost,
                        }), isCoHost ? "Couldn't remove co-host" : "Couldn't make co-host")}>
                        {isCoHost
                          ? <><ShieldOff className="h-3.5 w-3.5 mr-1" /> Remove co-host</>
                          : <><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Make co-host</>}
                      </Button>
                    )}
                    {!p.isLocal && !isTargetHost && (isHost || !isCoHost) && (
                      <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" disabled={busy}
                        onClick={() => run(p.id, () => moveWebinarSpeakerToAudience({
                          webinarId: webinar.id, roomName: webinar.room_name, userId: p.id,
                        }), "Couldn't move them to the audience")}>
                        <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Move to audience
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-300 mb-2">Audience ({audience.length})</p>
        {webinar.status !== 'live' && (
          <p className="text-xs text-gray-500 mb-2">You're backstage. Attendees wait outside until you go live.</p>
        )}
        {audience.length === 0 && orphanRequests.length === 0 ? (
          <p className="text-sm text-gray-500">No one watching yet.</p>
        ) : (
          <div className="space-y-2">
            {[
              ...audience.map((m) => ({ id: m.userId, name: m.userName })),
              ...orphanRequests.map((r) => ({ id: r.user_id, name: r.user_name || 'Attendee' })),
            ].map((m) => {
              const requested = requestedIds.has(m.id);
              const invited = invitedIds.has(m.id);
              return (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">
                    {requested && <Hand className="inline h-3.5 w-3.5 text-purple-300 mr-1" />}
                    {m.name}
                  </span>
                  <Button size="sm" className="h-8 px-2.5 text-xs bg-purple-600 hover:bg-purple-700 shrink-0"
                    disabled={invited || webinar.status !== 'live'}
                    onClick={() => speakerRequests.hostInvite(m.id, m.name)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> {invited ? 'Invited' : 'Bring up to speak'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default WebinarPeoplePanel;
