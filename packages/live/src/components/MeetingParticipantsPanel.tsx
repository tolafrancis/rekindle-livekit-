import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Badge } from '@rekindle/ui/badge';
import { getMeetingParticipants, MeetingParticipant, MeetingKind } from '../meetingStreamControl';
import { Loader2, Users } from 'lucide-react';

interface MeetingParticipantsPanelProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
  meetingKind?: MeetingKind;
}

const formatDuration = (joinedAt: string, leftAt: string | null): string => {
  const end = leftAt ? new Date(leftAt) : new Date();
  const ms = end.getTime() - new Date(joinedAt).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

/**
 * Host-only per-meeting attendance: total participant count, plus who joined
 * and when. Reads meeting_participants via livekit-egress's 'list-participants'
 * action (host-checked server-side — this is participant PII, not public data).
 */
export const MeetingParticipantsPanel: React.FC<MeetingParticipantsPanelProps> = ({
  meetingId, open, onClose, meetingKind = 'ministry_meeting',
}) => {
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!open || !meetingId) return;
    setLoading(true);
    getMeetingParticipants(meetingId, meetingKind)
      .then(({ participants: list, totalCount: count }) => {
        setParticipants(list);
        setTotalCount(count);
      })
      .finally(() => setLoading(false));
  }, [open, meetingId, meetingKind]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Participants{totalCount > 0 && <Badge variant="secondary">{totalCount}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading participants…
          </div>
        ) : participants.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No attendance recorded for this meeting yet.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Joined</th>
                  <th className="py-2 font-medium text-right">In call</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={`${p.userId}-${p.joinedAt}`} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{p.userName}</span>
                      {p.isGuest && <span className="ml-1.5 text-xs text-gray-400">(guest)</span>}
                      {p.isActive && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-green-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> in call
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500">
                      {new Date(p.joinedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="py-2 text-right text-gray-500">{formatDuration(p.joinedAt, p.leftAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MeetingParticipantsPanel;
