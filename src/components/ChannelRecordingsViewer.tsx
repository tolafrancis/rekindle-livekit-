import React, { useEffect, useState } from 'react';
import { Loader2, Video, Download, Clock } from 'lucide-react';
import { getChannelRecordings, muxDownloadUrl, type MuxRecording } from '@/lib/muxStream';
import { MuxVodPlayer } from './MuxVodPlayer';
import { RecordingRetentionBadge } from './RecordingRetentionBadge';
import { RECORDING_RETENTION_DAYS } from '@/lib/recordingRetention';

interface ChannelRecordingsViewerProps {
  channelId: string;
  isOwner?: boolean;
}

function formatDuration(s?: number): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Lists a channel's recorded broadcasts and plays them inline. Recordings are
 * Mux VOD assets — Mux auto-captures them from the live broadcast's RTMP feed
 * (Daily handles the live stream; Mux handles the recording) and serves them as
 * HLS, so they play in-app with no download step or S3 setup.
 */
export const ChannelRecordingsViewer: React.FC<ChannelRecordingsViewerProps> = ({ channelId }) => {
  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<MuxRecording[]>([]);
  const [active, setActive] = useState<MuxRecording | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getChannelRecordings(channelId).then((list) => {
      if (cancelled) return;
      setRecordings(list);
      setActive(list[0] || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [channelId]);

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading recordings…
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        <Video className="h-12 w-12 mx-auto mb-3" />
        <p className="font-medium">No recordings yet</p>
        <p className="text-sm">
          Recordings appear a few minutes after a broadcast ends — and only when recording was enabled.
        </p>
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500">
          <Clock className="h-3 w-3" /> Kept for {RECORDING_RETENTION_DAYS.broadcast} days, then removed automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Clock className="h-3 w-3" /> Broadcasts are kept for {RECORDING_RETENTION_DAYS.broadcast} days, then removed automatically — download any you want to keep.
      </p>

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

      {active && (() => {
        const dl = active.download || muxDownloadUrl(active.hls, `broadcast-${new Date(active.created).toISOString().slice(0, 10)}`);
        return (
          <div className="flex items-center justify-between gap-3">
            <RecordingRetentionBadge createdAt={active.created} kind="broadcast" />
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
        {recordings.map((r) => (
          <button
            key={r.uid}
            onClick={() => setActive(r)}
            className={`text-left rounded-lg border p-2 w-40 transition ${
              active?.uid === r.uid
                ? 'border-purple-500 ring-1 ring-purple-300'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="aspect-video bg-gray-800 rounded mb-1 overflow-hidden flex items-center justify-center">
              {r.thumbnail ? (
                <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <Video className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div className="text-xs text-gray-300">{new Date(r.created).toLocaleString()}</div>
            <div className="text-xs text-gray-500">{formatDuration(r.duration)}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChannelRecordingsViewer;
