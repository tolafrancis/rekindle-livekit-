import React from 'react';
import { Maximize2, PhoneOff } from 'lucide-react';
import { useActiveCall } from '../ActiveCallContext';

/**
 * Persistent render surface for the active meeting. Mounted ONCE above the tab
 * router, so the meeting element it renders survives tab changes. Full-screen when
 * expanded; a floating mini-player (bottom-right) when minimized, with maximize +
 * leave chrome (the shrunk in-meeting controls are too small to use).
 */
export const ActiveCallHost: React.FC = () => {
  const { call, minimized, endCall, maximize } = useActiveCall();
  if (!call) return null;

  return (
    <div
      className={
        // z-[70]: above the app sidebar/header (z-55/60) so the meeting covers the
        // app, but below Radix dialogs/popovers (z-80/90) so the in-meeting host
        // panel confirms, background picker and chat menus still layer on top.
        minimized
          ? 'fixed bottom-4 right-4 z-[70] w-72 sm:w-96 aspect-video rounded-xl overflow-hidden shadow-2xl border border-gray-700 bg-gray-900'
          // h-[100dvh] (dynamic viewport) instead of inset-0 so on iOS Safari the
          // meeting fits the VISIBLE area — otherwise inset-0 extends behind the
          // browser toolbar and the bottom control bar is cut off / untappable.
          : 'fixed inset-x-0 top-0 z-[70] h-[100dvh] bg-gray-900'
      }
    >
      {/* The meeting itself. Stays mounted whether full-screen or minimized, so the
          LiveKit connection persists while the user browses other tabs. */}
      <div className="w-full h-full">{call.node}</div>

      {minimized && (
        <>
          {/* The tiny in-meeting controls aren't usable at this size, so surface the
              two that matter: return to the meeting, and leave it. */}
          <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
            <button
              onClick={maximize}
              title="Return to meeting"
              className="bg-black/60 hover:bg-black/80 text-white rounded-md p-1.5"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => (call.onLeave ? call.onLeave() : endCall())}
              title="Leave meeting"
              className="bg-red-600 hover:bg-red-700 text-white rounded-md p-1.5"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={maximize}
            className="absolute inset-x-0 bottom-0 z-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-left text-[11px] text-white truncate"
            title="Return to meeting"
          >
            {call.title || 'Meeting in progress — tap to return'}
          </button>
        </>
      )}
    </div>
  );
};

export default ActiveCallHost;
