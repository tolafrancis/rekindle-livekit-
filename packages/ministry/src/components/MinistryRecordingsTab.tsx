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
  enable_recording?: boolean;
}

/** undefined = fixed default, null = "never", number = custom days. */
function retentionLabel(overrideDays: number | null | undefined): string {
  if (overrideDays === null) return 'Recordings are kept indefinitely.';
  const days = overrideDays ?? RECORDING_RETENTION_DAYS.meeting;
  return `Recordings are kept for ${days} days, then removed automatically.`;
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
 * A standalone recordings library for a ministry. It gathers the LiveKit
 * Egress recordings from every recording-enabled meeting in the ministry,
 * independent of any single meeting's card or link. Read-only.
 */
export const MinistryRecordingsTab: React.FC<{
  meetings: MeetingLike[];
  /** A storage_pack ministry's custom recording_retention_days: omit for the
   *  fixed default, null for "never". */
  retentionDaysOverride?: number | null;
}> = ({ meetings, retentionDaysOverride }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [active, setActive] = useState<LibraryItem | null>(null);

  // Any meeting recorded via LiveKit Egress may have recordings, keyed by its
  // own id (see getMeetingRecordings) — not by hls_playback_url/cf_live_input_uid,
  // which only webinar broadcasts (start-hls) ever set and plain meeting
  // recordings (start-recording) never do. The recording-enabled toggle is
  // still worth filtering on to skip the fetch for meetings that never record.
  const sourceMeetings = meetings.filter((m) => m.enable_recording !== false);

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
  }, [meetings.map((m) => `${m.id}:${m.enable_recording !== false}`).join(',')]);

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
          <Clock className="h-3 w-3" /> {retentionLabel(retentionDaysOverride)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Clock className="h-3 w-3" /> {retentionLabel(retentionDaysOverride)} Download any you want to keep.
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
              <RecordingRetentionBadge createdAt={active.created} kind="meeting" className="mt-1" retentionDaysOverride={retentionDaysOverride} />
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
