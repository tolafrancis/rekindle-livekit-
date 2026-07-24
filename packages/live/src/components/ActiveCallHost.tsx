import React from 'react';
import { Maximize2, PhoneOff, GripVertical } from 'lucide-react';
import { useActiveCall } from '../ActiveCallContext';

/**
 * Persistent render surface for the active meeting. Mounted ONCE above the tab
 * router, so the meeting element it renders survives tab changes. Full-screen when
 * expanded; a floating, draggable mini-player when minimized, with maximize +
 * leave chrome (the shrunk in-meeting controls are too small to use).
 */
export const ActiveCallHost: React.FC = () => {
  const { call, minimized, endCall, maximize } = useActiveCall();

  // Mini-player position. null = anchored to the default bottom-right corner;
  // once the user drags it we switch to explicit top-left coordinates.
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const drag = React.useRef<{
    startX: number; startY: number; originX: number; originY: number; moved: boolean;
  } | null>(null);
  const nodeRef = React.useRef<HTMLDivElement>(null);

  // Reset to the corner each time we re-minimize so it never opens off-screen
  // (e.g. after a resize/rotate while full-screen).
  React.useEffect(() => {
    if (!minimized) setPos(null);
  }, [minimized]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!minimized) return;
    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return; // ignore tiny jitter → keep taps clickable
    d.moved = true;
    const w = nodeRef.current?.offsetWidth ?? 0;
    const h = nodeRef.current?.offsetHeight ?? 0;
    const maxX = window.innerWidth - w;
    const maxY = window.innerHeight - h;
    const x = Math.min(Math.max(0, d.originX + dx), Math.max(0, maxX));
    const y = Math.min(Math.max(0, d.originY + dy), Math.max(0, maxY));
    setPos({ x, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  if (!call) return null;

  return (
    <div
      ref={nodeRef}
      style={minimized && pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
      className={
        // z-[70]: above the app sidebar/header (z-55/60) so the meeting covers the
        // app, but below Radix dialogs/popovers (z-80/90) so the in-meeting host
        // panel confirms, background picker and chat menus still layer on top.
        minimized
          ? 'fixed bottom-3 right-3 z-[70] aspect-video w-[min(22rem,90vw)] overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl'
          // h-[100dvh] (dynamic viewport) instead of inset-0 so on iOS Safari the
          // meeting fits the VISIBLE area — otherwise inset-0 extends behind the
          // browser toolbar and the bottom control bar is cut off / untappable.
          : 'fixed inset-x-0 top-0 z-[70] h-[100dvh] bg-gray-900'
      }
    >
      {/* The meeting itself. Stays mounted whether full-screen or minimized, so the
          LiveKit connection persists while the user browses other tabs. Flex container
          ensures content is properly centered and fills the space. */}
      <div className="h-full w-full min-h-0 overflow-hidden flex flex-col bg-gray-900">{call.node}</div>

      {minimized && (
        <>
          {/* Drag handle across the top: grab here to reposition the mini-player.
              Pointer events on the buttons stop propagation so taps still fire. */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute inset-x-0 top-0 z-10 flex touch-none cursor-grab items-center justify-between gap-1 bg-gradient-to-b from-black/70 to-transparent px-1.5 py-1 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-white/60" />
            {/* The tiny in-meeting controls aren't usable at this size, so surface the
                two that matter: return to the meeting, and leave it. */}
            <div className="flex items-center gap-1">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={maximize}
                title="Return to meeting"
                className="bg-black/60 hover:bg-black/80 text-white rounded-md p-1.5"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => (call.onLeave ? call.onLeave() : endCall())}
                title="Leave meeting"
                className="bg-red-600 hover:bg-red-700 text-white rounded-md p-1.5"
              >
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Meeting title next to the grip. The bottom is left free for the call's
              own mini media controls (mute / camera / react). */}
          {call.title && (
            <div className="pointer-events-none absolute left-8 top-1.5 z-0 max-w-[55%] truncate text-[11px] text-white/90">
              {call.title}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ActiveCallHost;
