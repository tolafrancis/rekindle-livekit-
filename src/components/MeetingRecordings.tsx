import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getMeetingRecordings, MeetingRecording } from '@/lib/muxMeetingStream';
import { muxDownloadUrl } from '@/lib/muxStream';
import { MuxVodPlayer } from './MuxVodPlayer';
import { RecordingRetentionBadge } from './RecordingRetentionBadge';
import { RECORDING_RETENTION_DAYS } from '@/lib/recordingRetention';
import { Loader2, Video, Download } from 'lucide-react';

interface MeetingRecordingsProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
}

const formatDuration = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export const MeetingRecordings: React.FC<MeetingRecordingsProps> = ({ meetingId, open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [recordings, setRecordings] = useState<MeetingRecording[]>([]);
  const [active, setActive] = useState<MeetingRecording | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getMeetingRecordings(meetingId)
      .then(list => {
        setRecordings(list);
        setActive(list[0] || null);
      })
      .finally(() => setLoading(false));
  }, [open, meetingId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recordings</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading recordings…
          </div>
        ) : recordings.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No recordings yet. A recording appears a few minutes after the webinar ends.
            <br />
            <span className="text-xs text-gray-400">
              Recordings are kept for {RECORDING_RETENTION_DAYS.meeting} days, then removed automatically.
            </span>
          </p>
        ) : (
          <div className="space-y-3">
            {active && (
              <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                <MuxVodPlayer
                  key={active.uid}
                  src={active.hls || ''}
                  poster={active.thumbnail}
                  className="w-full h-full"
                />
              </div>
            )}

            {/* Download — available to leaders/admins (only they can open this
                dialog). Uses the recording's MP4 rendition. */}
            {active && (() => {
              const filename = `meeting-recording-${new Date(active.created).toISOString().slice(0, 10)}`;
              const dl = (active as any).download || muxDownloadUrl(active.hls, filename);
              return (
                <div className="flex items-center justify-between gap-3">
                  <RecordingRetentionBadge createdAt={active.created} kind="meeting" />
                  {dl ? (
                    <a
                      href={dl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-700"
                    >
                      <Download className="h-4 w-4" /> Download recording
                    </a>
                  ) : null}
                </div>
              );
            })()}

            <div className="flex flex-wrap gap-2">
              {recordings.map(r => (
                <button
                  key={r.uid}
                  onClick={() => setActive(r)}
                  className={`text-left rounded-lg border p-2 w-40 transition ${active?.uid === r.uid ? 'border-purple-500 ring-1 ring-purple-300' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="aspect-video bg-gray-100 rounded mb-1 overflow-hidden flex items-center justify-center">
                    {r.thumbnail ? (
                      <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Video className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="text-xs text-gray-600">{new Date(r.created).toLocaleString()}</div>
                  <div className="text-xs text-gray-400">{formatDuration(r.duration)}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
