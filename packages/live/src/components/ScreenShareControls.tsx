import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic, MicOff, Video, VideoOff, MonitorOff, Users, PhoneOff, Hand,
  ChevronDown, ChevronUp, ExternalLink, GripVertical, Minimize2, Maximize2,
} from 'lucide-react';
import { useLanguage } from '@rekindle/features/LanguageContext';

/**
 * Zoom-style floating controls for the person who is sharing their screen
 * (2026-11-01). While you share, you're usually looking at another tab or app,
 * so the meeting's own control bar is out of sight: no way to mute, see who's
 * there or stop sharing without switching back.
 *
 * Two surfaces, same panel:
 *  - Chrome / Edge desktop: an always-on-top Document Picture-in-Picture
 *    window that floats over every tab and app. It's opened from the Share
 *    Screen click (the browser needs a user gesture), and closes itself when
 *    the share ends.
 *  - Everywhere else (or after closing the pop-out): a draggable bar inside
 *    the meeting page that can be minimized to a small pill.
 *
 * The participants list can be collapsed so the bar stays small, the same
 * way Zoom lets you hide the participant strip while sharing.
 */

export interface ScreenShareControlsParticipant {
  sessionId: string;
  userName: string;
  isLocal: boolean;
  hasAudio: boolean;
  isSpeaking?: boolean;
  role?: string | null;
}

export interface ScreenShareControlsProps {
  /** True while THIS user is sharing their screen. */
  isSharing: boolean;
  isMicOn: boolean;
  isCameraOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onStopShare: () => void;
  onLeave: () => void;
  participants: ScreenShareControlsParticipant[];
  raisedHandIds: string[];
  isModerator: boolean;
  onMuteParticipant: (sessionId: string) => void;
  waitingRoom: { sessionId: string; userName: string }[];
  onAdmit: (sessionId: string) => void;
  /** Hide the in-page bar (e.g. Android system PiP); the pop-out still shows. */
  hideInPage?: boolean;
}

export interface ScreenShareControlsHandle {
  /** Open the always-on-top pop-out. MUST be called synchronously inside a
   *  click handler (the browser requires a user gesture). No-op where the
   *  Document Picture-in-Picture API doesn't exist. */
  openPopout: () => void;
  /** Close the pop-out if the share never actually started (picker cancelled). */
  closeIfNotSharing: () => void;
}

type DocPiP = {
  requestWindow: (opts?: { width?: number; height?: number; disallowReturnToOpener?: boolean }) => Promise<Window>;
  window: Window | null;
};

const getDocPiP = (): DocPiP | null => {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { documentPictureInPicture?: DocPiP }).documentPictureInPicture) ?? null;
};

export const supportsPopoutControls = (): boolean => getDocPiP() !== null;

/** Copy the page's stylesheets into the pop-out so the Tailwind classes work. */
function copyStyles(target: Window) {
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    target.document.head.appendChild(node.cloneNode(true));
  });
  target.document.documentElement.className = document.documentElement.className;
  target.document.body.style.margin = '0';
  target.document.body.style.background = '#111827';
}

const POPOUT_WIDTH = 340;
const POPOUT_HEIGHT_COLLAPSED = 132;
const POPOUT_HEIGHT_EXPANDED = 420;
const POPOUT_MINI_WIDTH = 300;
const POPOUT_MINI_HEIGHT = 56;

/** Bring the meeting tab to the front. Chrome lets a click inside the
 *  pop-out focus the meeting tab; elsewhere this is a harmless no-op. */
const returnToMeeting = () => {
  try { window.focus(); } catch { /* not allowed: user switches back */ }
};

export const ScreenShareControls = forwardRef<ScreenShareControlsHandle, ScreenShareControlsProps>((props, ref) => {
  const { isSharing } = props;
  const [popout, setPopout] = useState<Window | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const isSharingRef = useRef(isSharing);
  isSharingRef.current = isSharing;
  const wasSharingRef = useRef(false);

  const closePopout = useCallback(() => {
    const pip = getDocPiP();
    pip?.window?.close();
    setPopout(null);
  }, []);

  const openPopout = useCallback(() => {
    const pip = getDocPiP();
    if (!pip || pip.window) return;
    pip.requestWindow({ width: POPOUT_WIDTH, height: POPOUT_HEIGHT_COLLAPSED })
      .then((w) => {
        copyStyles(w);
        w.document.title = 'Meeting controls';
        w.addEventListener('pagehide', () => setPopout(null));
        setPopout(w);
      })
      .catch(() => { /* no gesture / blocked: the in-page bar still shows */ });
  }, []);

  useImperativeHandle(ref, () => ({
    openPopout,
    closeIfNotSharing: () => { if (!isSharingRef.current) closePopout(); },
  }), [openPopout, closePopout]);

  // Close the pop-out when the share ends (Stop button, the browser's own
  // "Stop sharing" bar, or the track ending) and go back to the meeting tab.
  // Also on unmount (leaving).
  useEffect(() => {
    if (wasSharingRef.current && !isSharing) {
      returnToMeeting();
      closePopout();
    }
    if (isSharing) setMinimized(false);
    wasSharingRef.current = isSharing;
  }, [isSharing, closePopout]);
  useEffect(() => () => { getDocPiP()?.window?.close(); }, []);

  // Fallback: Chrome can open the pop-out by itself when you switch away from
  // the meeting tab during a call (automatic picture-in-picture for video
  // calls). Registered only while sharing; the handler runs with the
  // activation requestWindow needs.
  useEffect(() => {
    if (!isSharing || !supportsPopoutControls()) return;
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => openPopout());
    } catch { return; /* action not supported in this browser */ }
    return () => {
      try { ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, null); } catch { /* ignore */ }
    };
  }, [isSharing, openPopout]);

  // Stop Share from the pop-out (or bar): stop, then jump back to the
  // meeting tab while the click's activation still allows focusing it.
  const stopAndReturn = useCallback(() => {
    props.onStopShare();
    returnToMeeting();
  }, [props.onStopShare]); // eslint-disable-line react-hooks/exhaustive-deps

  // Size the pop-out to what it shows: a small strip when minimized, taller
  // when the participant list is open.
  const [popMini, setPopMini] = useState(false);
  useEffect(() => {
    if (!popout) return;
    const chromeW = popout.outerWidth - popout.innerWidth;
    const chromeH = popout.outerHeight - popout.innerHeight;
    try {
      popout.resizeTo(
        (popMini ? POPOUT_MINI_WIDTH : POPOUT_WIDTH) + chromeW,
        (popMini ? POPOUT_MINI_HEIGHT : showPeople ? POPOUT_HEIGHT_EXPANDED : POPOUT_HEIGHT_COLLAPSED) + chromeH,
      );
    } catch { /* resize needs a gesture in some browsers; user can drag */ }
  }, [showPeople, popMini, popout]);
  useEffect(() => { if (!popout) setPopMini(false); }, [popout]);

  if (popout) {
    return createPortal(
      <div className="h-screen w-full overflow-hidden bg-gray-900 text-white">
        {popMini ? (
          <MiniStrip
            isMicOn={props.isMicOn}
            onToggleMic={props.onToggleMic}
            onStopShare={stopAndReturn}
            onExpand={() => setPopMini(false)}
          />
        ) : (
          <ControlsPanel
            {...props}
            onStopShare={stopAndReturn}
            showPeople={showPeople}
            onTogglePeople={() => setShowPeople((v) => !v)}
            fillHeight
            headerExtra={<MinimizeButton onClick={() => setPopMini(true)} />}
          />
        )}
      </div>,
      popout.document.body,
    );
  }

  if (!isSharing || props.hideInPage) return null;

  return (
    <InPageBar
      {...props}
      onStopShare={stopAndReturn}
      minimized={minimized}
      onMinimize={setMinimized}
      showPeople={showPeople}
      onTogglePeople={() => setShowPeople((v) => !v)}
      onPopout={supportsPopoutControls() ? openPopout : undefined}
    />
  );
});
ScreenShareControls.displayName = 'ScreenShareControls';

interface PanelProps extends ScreenShareControlsProps {
  showPeople: boolean;
  onTogglePeople: () => void;
  fillHeight?: boolean;
  headerExtra?: React.ReactNode;
  dragHandle?: React.ReactNode;
}

const btn = 'flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors';

const ControlsPanel: React.FC<PanelProps> = ({
  isMicOn, isCameraOn, onToggleMic, onToggleCamera, onStopShare, onLeave,
  participants, raisedHandIds, isModerator, onMuteParticipant, waitingRoom, onAdmit,
  showPeople, onTogglePeople, fillHeight, headerExtra, dragHandle,
}) => {
  const { t } = useLanguage();
  const hands = new Set(raisedHandIds);
  const sorted = [...participants].sort((a, b) =>
    (a.isLocal ? -1 : b.isLocal ? 1 : 0)
    || (hands.has(b.sessionId) ? 1 : 0) - (hands.has(a.sessionId) ? 1 : 0)
    || a.userName.localeCompare(b.userName));
  const handCount = participants.filter((p) => hands.has(p.sessionId) && !p.isLocal).length;

  return (
    <div className={`flex flex-col ${fillHeight ? 'h-full' : ''}`}>
      <div className="flex items-center gap-2 px-2 pt-2">
        {dragHandle}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-green-400">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-400" />
          <span className="truncate">{t('dailyVideoCall', 'youAreSharing', "You're sharing your screen")}</span>
        </span>
        {headerExtra}
      </div>
      <div className="flex items-stretch justify-between gap-1 px-2 py-2">
        <button type="button" onClick={onToggleMic} className={`${btn} ${isMicOn ? 'hover:bg-white/10' : 'text-red-400 hover:bg-red-500/20'}`}>
          {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          {isMicOn ? t('dailyVideoCall', 'mute', 'Mute') : t('dailyVideoCall', 'unmute', 'Unmute')}
        </button>
        <button type="button" onClick={onToggleCamera} className={`${btn} ${isCameraOn ? 'hover:bg-white/10' : 'text-red-400 hover:bg-red-500/20'}`}>
          {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          {isCameraOn ? t('dailyVideoCall', 'stopVideo', 'Stop Video') : t('dailyVideoCall', 'startVideo', 'Start Video')}
        </button>
        <button
          type="button"
          onClick={onTogglePeople}
          aria-expanded={showPeople}
          className={`${btn} relative ${showPeople ? 'bg-white/15' : 'hover:bg-white/10'}`}
        >
          <Users className="h-5 w-5" />
          <span className="flex items-center gap-0.5">
            {participants.length}
            {showPeople ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
          {(handCount > 0 || (isModerator && waitingRoom.length > 0)) && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] text-white">
              {handCount + (isModerator ? waitingRoom.length : 0)}
            </span>
          )}
        </button>
        <button type="button" onClick={onStopShare} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
          <MonitorOff className="h-5 w-5" />
          {t('dailyVideoCall', 'stopShare', 'Stop Share')}
        </button>
        <button type="button" onClick={onLeave} className={`${btn} text-red-400 hover:bg-red-500/20`}>
          <PhoneOff className="h-5 w-5" />
          {t('dailyVideoCall', 'leave', 'Leave')}
        </button>
      </div>

      {showPeople && (
        <div className={`border-t border-white/10 overflow-y-auto px-2 py-2 ${fillHeight ? 'min-h-0 flex-1' : 'max-h-64'}`}>
          {isModerator && waitingRoom.length > 0 && (
            <div className="mb-2 space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-amber-300">
                {t('dailyVideoCall', 'waitingRoom', 'Waiting room')} ({waitingRoom.length})
              </p>
              {waitingRoom.map((w) => (
                <div key={w.sessionId} className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1">
                  <span className="truncate text-sm">{w.userName}</span>
                  <button type="button" onClick={() => onAdmit(w.sessionId)} className="rounded bg-purple-600 px-2 py-0.5 text-xs hover:bg-purple-700">
                    {t('dailyVideoCall', 'admit', 'Admit')}
                  </button>
                </div>
              ))}
            </div>
          )}
          <ul className="space-y-1">
            {sorted.map((p) => (
              <li key={p.sessionId} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.isSpeaking ? 'bg-green-600 ring-2 ring-green-400' : 'bg-purple-700'}`}>
                  {p.userName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.userName}
                  {p.isLocal && <span className="text-gray-400"> ({t('dailyVideoCall', 'you', 'You')})</span>}
                  {p.role === 'host' && <span className="ml-1 rounded bg-amber-500/80 px-1 text-[10px]">{t('dailyVideoCall', 'host', 'Host')}</span>}
                  {p.role === 'co-host' && <span className="ml-1 rounded bg-blue-500/80 px-1 text-[10px]">{t('dailyVideoCall', 'coHost', 'Co-host')}</span>}
                </span>
                {hands.has(p.sessionId) && <Hand className="h-4 w-4 shrink-0 text-amber-400" />}
                {isModerator && !p.isLocal && p.hasAudio ? (
                  <button
                    type="button"
                    onClick={() => onMuteParticipant(p.sessionId)}
                    title={t('dailyVideoCall', 'mute', 'Mute')}
                    aria-label={`${t('dailyVideoCall', 'mute', 'Mute')} ${p.userName}`}
                    className="rounded p-1 text-green-400 hover:bg-white/10"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                ) : p.hasAudio ? (
                  <Mic className="h-4 w-4 shrink-0 text-green-400" />
                ) : (
                  <MicOff className="h-4 w-4 shrink-0 text-red-400" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const MinimizeButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useLanguage();
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-medium text-white hover:bg-white/25" title={t('dailyVideoCall', 'minimizeControls', 'Minimize')}>
      <Minimize2 className="h-3.5 w-3.5" />
      {t('dailyVideoCall', 'minimizeControls', 'Minimize')}
    </button>
  );
};

/** The minimized pop-out: just mic, Stop Share and expand. */
const MiniStrip: React.FC<{ isMicOn: boolean; onToggleMic: () => void; onStopShare: () => void; onExpand: () => void }> = ({ isMicOn, onToggleMic, onStopShare, onExpand }) => {
  const { t } = useLanguage();
  return (
    <div className="flex h-full items-center justify-between gap-1 px-2">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-400" />
      <button type="button" onClick={onToggleMic} className="rounded-full p-1.5 hover:bg-white/10" aria-label={isMicOn ? t('dailyVideoCall', 'mute', 'Mute') : t('dailyVideoCall', 'unmute', 'Unmute')}>
        {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-red-400" />}
      </button>
      <button type="button" onClick={onStopShare} className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-medium hover:bg-red-700">
        {t('dailyVideoCall', 'stopShare', 'Stop Share')}
      </button>
      <button type="button" onClick={onExpand} className="flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-medium hover:bg-white/25" title={t('dailyVideoCall', 'maximizeControls', 'Maximize')}>
        <Maximize2 className="h-3.5 w-3.5" />
        {t('dailyVideoCall', 'maximizeControls', 'Maximize')}
      </button>
    </div>
  );
};

interface InPageProps extends ScreenShareControlsProps {
  minimized: boolean;
  onMinimize: (v: boolean) => void;
  showPeople: boolean;
  onTogglePeople: () => void;
  onPopout?: () => void;
}

/** Draggable floating bar inside the meeting page, minimizable to a pill. */
const InPageBar: React.FC<InPageProps> = ({ minimized, onMinimize, onPopout, ...panel }) => {
  const { t } = useLanguage();
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = boxRef.current?.offsetWidth ?? 0;
    const h = boxRef.current?.offsetHeight ?? 0;
    setPos({
      x: Math.min(Math.max(0, d.ox + e.clientX - d.sx), Math.max(0, window.innerWidth - w)),
      y: Math.min(Math.max(0, d.oy + e.clientY - d.sy), Math.max(0, window.innerHeight - h)),
    });
  };
  const onUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  const handle = (
    <span
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="cursor-grab touch-none text-white/50 active:cursor-grabbing"
      aria-hidden="true"
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );

  const style = pos ? { left: pos.x, top: pos.y } : undefined;
  const anchor = pos ? '' : 'top-16 left-1/2 -translate-x-1/2';

  if (minimized) {
    return (
      <div ref={boxRef} style={style} className={`fixed z-[75] flex items-center gap-1 rounded-full bg-gray-900/95 py-1 pl-2 pr-1 text-white shadow-2xl ring-1 ring-white/10 ${anchor}`}>
        {handle}
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
        <button type="button" onClick={panel.onToggleMic} className="rounded-full p-1.5 hover:bg-white/10" aria-label={panel.isMicOn ? t('dailyVideoCall', 'mute', 'Mute') : t('dailyVideoCall', 'unmute', 'Unmute')}>
          {panel.isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-red-400" />}
        </button>
        <button type="button" onClick={panel.onStopShare} className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-medium hover:bg-red-700">
          {t('dailyVideoCall', 'stopShare', 'Stop Share')}
        </button>
        <button type="button" onClick={() => onMinimize(false)} className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-xs font-medium hover:bg-white/25">
          <Maximize2 className="h-3.5 w-3.5" />
          {t('dailyVideoCall', 'maximizeControls', 'Maximize')}
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={style} className={`fixed z-[75] w-[min(22rem,calc(100vw-1rem))] rounded-xl bg-gray-900/95 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-sm ${anchor}`}>
      <ControlsPanel
        {...panel}
        dragHandle={handle}
        headerExtra={
          <>
            {onPopout && (
              <button type="button" onClick={onPopout} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white" title={t('dailyVideoCall', 'popOutControls', 'Pop out controls (stays on top of other windows)')} aria-label={t('dailyVideoCall', 'popOutControls', 'Pop out controls (stays on top of other windows)')}>
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
            <MinimizeButton onClick={() => onMinimize(true)} />
          </>
        }
      />
    </div>
  );
};
