import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Room, RoomEvent, Track,
  type Participant, type RemoteTrack, type RemoteParticipant,
} from 'livekit-client';
import {
  DEFAULT_LAYOUT_STATE, gridColumns, layoutFromRoomMetadata, recordingStageState, resolveStage,
  type MeetingLayoutState, type RecordingLayout, RECORDING_LAYOUTS,
} from '../layout/meetingLayout';

/**
 * LiveKit Egress recording template (/recording-template).
 *
 * livekit-egress starts a Room Composite recording with customBaseUrl pointing
 * here for every recording layout except Gallery (which uses LiveKit's own
 * grid). Egress opens this page in a headless browser as a hidden participant
 * with ?url=…&token=…&layout=…, records whatever it draws plus the audio it
 * plays, starts when it logs START_RECORDING and stops on END_RECORDING.
 *
 * What it draws comes from the room metadata the host sets (the spotlight
 * order and the recording layout), through the same resolveStage every
 * participant uses, so the recording never depends on any viewer's screen.
 */

interface Tile {
  identity: string;
  name: string;
  camera?: RemoteTrack;
  screen?: RemoteTrack;
  isSpeaking: boolean;
}

const VideoEl: React.FC<{ track?: RemoteTrack; fit?: 'cover' | 'contain' }> = ({ track, fit = 'cover' }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`absolute inset-0 h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`} />;
};

const PersonTile: React.FC<{ tile: Tile }> = ({ tile }) => (
  <div className="relative h-full w-full overflow-hidden rounded-lg bg-gray-900">
    {tile.camera ? (
      <VideoEl track={tile.camera} />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 text-4xl font-bold text-white">
          {tile.name.charAt(0).toUpperCase()}
        </div>
      </div>
    )}
    <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-sm text-white">{tile.name}</div>
  </div>
);

function readTiles(room: Room): Tile[] {
  const out: Tile[] = [];
  const shadows: RemoteParticipant[] = [];
  room.remoteParticipants.forEach((p: RemoteParticipant) => {
    // The translation bot never appears on a recording.
    if (p.identity.startsWith('rlt-bot-')) return;
    if (p.identity.endsWith('-screenshare')) { shadows.push(p); return; }
    const camera = p.getTrackPublication(Track.Source.Camera);
    const screen = p.getTrackPublication(Track.Source.ScreenShare);
    out.push({
      identity: p.identity,
      name: p.name || p.identity,
      camera: camera?.track && !camera.isMuted ? (camera.track as RemoteTrack) : undefined,
      screen: screen?.track ? (screen.track as RemoteTrack) : undefined,
      isSpeaking: p.isSpeaking,
    });
  });
  // Native Android screen share comes from a "<identity>-screenshare" shadow
  // participant: merge it into the real participant's tile.
  for (const shadow of shadows) {
    const real = out.find((t) => t.identity === shadow.identity.slice(0, -'-screenshare'.length));
    const screen = shadow.getTrackPublication(Track.Source.ScreenShare);
    if (real && !real.screen && screen?.track) real.screen = screen.track as RemoteTrack;
  }
  return out;
}

export default function RecordingTemplatePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [layout, setLayout] = useState<MeetingLayoutState>(DEFAULT_LAYOUT_STATE);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = params.get('url');
    const token = params.get('token');
    const layoutParam = params.get('layout') as RecordingLayout | null;
    if (!url || !token) {
      console.error('recording template: missing url or token');
      return;
    }
    const room = new Room({ adaptiveStream: false, dynacast: false });
    const refresh = () => setTiles(readTiles(room));
    const readLayout = () => {
      const fromRoom = layoutFromRoomMetadata(room.metadata);
      const base = fromRoom ?? { ...DEFAULT_LAYOUT_STATE };
      // The layout egress was started with wins until the host changes it.
      if (!fromRoom && layoutParam && RECORDING_LAYOUTS.includes(layoutParam)) base.recordingLayout = layoutParam;
      setLayout(base);
    };
    let started = false;

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio && audioRef.current) {
          const el = track.attach();
          audioRef.current.appendChild(el);
        }
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
        refresh();
      })
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.RoomMetadataChanged, readLayout)
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const first = speakers.find((s) => !s.isLocal);
        // Same idea as the meeting's debounce: keep the last speaker through silence.
        if (first) setActiveSpeaker(first.identity);
        refresh();
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('END_RECORDING');
      });

    room.connect(url, token).then(() => {
      readLayout();
      refresh();
      if (!started) {
        started = true;
        // Egress starts recording on this line.
        console.log('START_RECORDING');
      }
    }).catch((err) => {
      console.error('recording template: connect failed', err);
    });

    return () => { room.disconnect(); };
  }, [params]);

  const recState = recordingStageState(layout);
  const stage = resolveStage({
    state: recState,
    participants: tiles.map((t) => ({ sessionId: t.identity, isSpeaking: t.isSpeaking, hasScreenShare: !!t.screen })),
    activeSpeakerId: activeSpeaker,
    includeLocalInThumbnails: true,
  });
  const byId = new Map(tiles.map((t) => [t.identity, t] as const));
  const main = stage.main.map((id) => byId.get(id)).filter(Boolean) as Tile[];
  const thumbs = stage.thumbnails.map((id) => byId.get(id)).filter(Boolean) as Tile[];
  const sharer = stage.screenOf ? byId.get(stage.screenOf) : undefined;

  let body: React.ReactNode;
  if (tiles.length === 0) {
    body = <div className="flex h-full items-center justify-center text-2xl text-white/60">Waiting for participants…</div>;
  } else if (stage.kind === 'screen' && sharer?.screen) {
    body = (
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
          <VideoEl track={sharer.screen} fit="contain" />
        </div>
        {main.length > 0 && (
          <div className={`mx-auto grid h-[26%] shrink-0 gap-3 ${main.length > 1 ? 'w-[60%] grid-cols-2' : 'w-[30%] grid-cols-1'}`}>
            {main.map((t) => <PersonTile key={t.identity} tile={t} />)}
          </div>
        )}
        {thumbs.length > 0 && (
          <div className="flex h-[16%] shrink-0 gap-2">
            {thumbs.slice(0, 8).map((t) => <div key={t.identity} className="aspect-video h-full"><PersonTile tile={t} /></div>)}
          </div>
        )}
      </div>
    );
  } else if (stage.kind === 'dual') {
    body = (
      <div className="grid h-full grid-cols-2 items-center gap-3 p-3">
        {main.map((t) => <div key={t.identity} className="aspect-video w-full"><PersonTile tile={t} /></div>)}
      </div>
    );
  } else if (stage.kind === 'speaker' && main[0]) {
    body = (
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="min-h-0 flex-1"><PersonTile tile={main[0]} /></div>
        {thumbs.length > 0 && (
          <div className="flex h-[16%] shrink-0 justify-center gap-2">
            {thumbs.slice(0, 8).map((t) => <div key={t.identity} className="aspect-video h-full"><PersonTile tile={t} /></div>)}
          </div>
        )}
      </div>
    );
  } else {
    const list = stage.kind === 'multi' ? main : thumbs.length ? thumbs : tiles;
    const shown = list.slice(0, 16);
    const cols = shown.length > 9 ? 4 : gridColumns(shown.length);
    body = (
      <div className="grid h-full gap-3 p-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
        {shown.map((t) => <PersonTile key={t.identity} tile={t} />)}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {body}
      <div ref={audioRef} className="hidden" />
    </div>
  );
}
