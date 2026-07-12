import React, { useEffect, useState } from 'react';
import { getMeetingRecordings, MeetingRecording } from '@rekindle/live/muxMeetingStream';
import { muxDownloadUrl } from '@rekindle/live/muxStream';
import { MuxVodPlayer } from '@rekindle/live/components/MuxVodPlayer';
import { RecordingRetentionBadge } from '@rekindle/live/components/RecordingRetentionBadge';
import { RECORDING_RETENTION_DAYS } from '@rekindle/live/recordingRetention';
import { Loader2, Video, Download, Clock } from 'lucide-react';

interface MeetingLike {
  id: string;
  title: string;
  cf_live_input_uid?: string;
  hls_playback_url?: string;
  enable_recording?: boolean;
}

interface LibraryItem extends MeetingRecording {
  meetingTitle: string;
}

const formatDuration = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * A standalone recordings library for a ministry. It gathers the Cloudflare
 * recordings from every webinar in the ministry (any meeting that has a live
 * input), independent of any single meeting's card or link. Read-only.
 */
export const MinistryRecordingsTab: React.FC<{ meetings: MeetingLike[] }> = ({ meetings }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [active, setActive] = useState<LibraryItem | null>(null);

  // A meeting can have recordings if it was ever provisioned for streaming
  // (Mux meetings carry an hls_playback_url; legacy Cloudflare ones a
  // cf_live_input_uid) AND the host left recording enabled. Mux records every
  // stream automatically, so this toggle controls whether we *surface* it.
  const sourceMeetings = meetings.filter(
    (m) => (m.hls_playback_url || m.cf_live_input_uid) && m.enable_recording !== false,
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all(
      sourceMeetings.map(async (m) => {
        const recs = await getMeetingRecordings(m.id);
        return recs.map((r) => ({ ...r, meetingTitle: m.title }));
      })
    )
      .then((groups) => {
        if (cancelled) return;
        const merged = groups
          .flat()
          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        setItems(merged);
        setActive(merged[0] || null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings.map((m) => `${m.hls_playback_url || m.cf_live_input_uid || ''}:${m.enable_recording !== false}`).join(',')]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading recordings…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Video className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold mb-1">No recordings yet</h3>
        <p className="text-gray-500 max-w-md">
          Webinar recordings appear here a few minutes after a broadcast ends. They're
          saved automatically — you don't need to start a meeting to watch them.
        </p>
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" /> Recordings are kept for {RECORDING_RETENTION_DAYS.meeting} days, then removed automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Clock className="h-3 w-3" /> Recordings are kept for {RECORDING_RETENTION_DAYS.meeting} days, then removed automatically — download any you want to keep.
      </p>

      {active && (
        <div className="space-y-2">
          <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
            <MuxVodPlayer
              key={active.uid}
              src={active.hls || ''}
              poster={active.thumbnail}
              className="w-full h-full"
            />
          </div>
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <p className="font-medium">{active.meetingTitle}</p>
              <p className="text-sm text-gray-500">
                {new Date(active.created).toLocaleString()} · {formatDuration(active.duration)}
              </p>
              <RecordingRetentionBadge createdAt={active.created} kind="meeting" className="mt-1" />
            </div>
            {(() => {
              const dl = (active as any).download || muxDownloadUrl(active.hls, `${active.meetingTitle}-${new Date(active.created).toISOString().slice(0, 10)}`);
              return dl ? (
                <a
                  href={dl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-700"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              ) : null;
            })()}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((r) => (
          <button
            key={r.uid}
            onClick={() => setActive(r)}
            className={`text-left rounded-lg border p-2 transition ${
              active?.uid === r.uid
                ? 'border-purple-500 ring-1 ring-purple-300'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="aspect-video bg-gray-100 rounded mb-2 overflow-hidden flex items-center justify-center">
              {r.thumbnail ? (
                <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <Video className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div className="text-sm font-medium truncate">{r.meetingTitle}</div>
            <div className="text-xs text-gray-500">{new Date(r.created).toLocaleDateString()}</div>
            <div className="text-xs text-gray-400">{formatDuration(r.duration)}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MinistryRecordingsTab;
