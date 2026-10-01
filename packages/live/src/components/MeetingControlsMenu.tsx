import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Users } from 'lucide-react';
import { LayoutMenuButton, SpotlightPanelButton, type LayoutActions } from './MeetingLayoutControls';
import { FloatingBackgroundButton } from './FloatingBackgroundButton';
import type { MeetingLayoutState } from '../layout/meetingLayout';

interface MeetingControlsMenuProps {
  isModerator: boolean;
  showHostControlsButton?: boolean;
  layoutState: MeetingLayoutState;
  layoutActions: LayoutActions;
  participants: Array<{ sessionId: string; userName: string; isLocal?: boolean }>;
  isNative: boolean;
  videoBackground: string;
  onBackgroundChange: (mode: string) => void;
  waitingRoomCount: number;
  onOpenHostControls: () => void;
}

/**
 * Consolidates Layout, Spotlight, Background and Host Controls into one
 * flyout (2026-09-29) instead of crowding the bottom control bar. Each of
 * those is already its own self-contained trigger+popover/dropdown
 * component, not designed to be nested inside another Radix overlay
 * (Popover/DropdownMenu-inside-another-Popover/DropdownMenu risks
 * focus/close bugs) — so this is deliberately a plain, manually-toggled
 * flyout `<div>`, not itself a Radix Popover/DropdownMenu, with those
 * existing components simply placed inside it as ordinary children. Each
 * still opens its own independent overlay on click, completely unaffected.
 */
export const MeetingControlsMenu: React.FC<MeetingControlsMenuProps> = ({
  isModerator,
  showHostControlsButton = true,
  layoutState,
  layoutActions,
  participants,
  isNative,
  videoBackground,
  onBackgroundChange,
  waitingRoomCount,
  onOpenHostControls,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const showHostControlsRow = isModerator && showHostControlsButton;

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Meeting controls"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors"
      >
        <SlidersHorizontal className="h-5 w-5" />
        {showHostControlsRow && waitingRoomCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-auto min-w-[220px] rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-xl">
          <div className="flex flex-wrap items-start justify-center gap-3">
            {isModerator && <LayoutMenuButton layout={layoutState} actions={layoutActions} />}
            {isModerator && (
              <SpotlightPanelButton layout={layoutState} actions={layoutActions} people={participants} />
            )}
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <FloatingBackgroundButton isNative={isNative} value={videoBackground} onChange={onBackgroundChange} />
              <span className="text-xs font-medium text-gray-300">Background</span>
            </div>
            {showHostControlsRow && (
              <button
                type="button"
                onClick={() => { setOpen(false); onOpenHostControls(); }}
                className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
              >
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-white transition-all duration-200 group-hover:bg-gray-600 sm:h-16 sm:w-16">
                  <Users className="h-5 w-5 sm:h-7 sm:w-7" />
                  {waitingRoomCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs text-white">
                      {waitingRoomCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-gray-300">Host Controls</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingControlsMenu;
