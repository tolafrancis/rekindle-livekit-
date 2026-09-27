import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import {
  ArrowLeftRight, Crown, LayoutGrid, MicOff, MoreHorizontal, Pin, PinOff, Plus, Shield,
  Sparkles, Star, UserMinus, VideoOff, X,
} from 'lucide-react';
import {
  LAYOUT_LABELS, LAYOUT_MODES, MAX_DUAL_SPOTLIGHT, MAX_SPOTLIGHT, RECORDING_LABELS, RECORDING_LAYOUTS,
  SCREEN_SHARE_LABELS, SCREEN_SHARE_MODES,
  type LayoutMode, type MeetingLayoutState, type RecordingLayout, type ScreenShareMode,
} from '../layout/meetingLayout';

/**
 * Controls for the host's shared meeting layout and multi-spotlight
 * (layout/meetingLayout.ts): the per-participant menu on every tile, and the
 * Layout and Spotlight buttons in the host's toolbar. Everything that changes
 * what everyone sees is shown only to a host or co-host; Pin is for anyone.
 */

export interface LayoutActions {
  spotlightOnly: (id: string) => void;
  addToSpotlight: (id: string) => void;
  removeFromSpotlight: (id: string) => void;
  clearSpotlights: () => void;
  swapSpeakers: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setScreenShareMode: (mode: ScreenShareMode) => void;
  setRecordingLayout: (layout: RecordingLayout) => void;
  setShowThumbnails: (show: boolean) => void;
}

interface MenuPerson {
  sessionId: string;
  userName: string;
  isLocal?: boolean;
}

interface ParticipantTileMenuProps {
  participant: MenuPerson;
  layout: MeetingLayoutState;
  actions: LayoutActions;
  isModerator: boolean;
  /** Only the real host may hand over the host role. */
  canMakeHost: boolean;
  role: string;
  isPinned: boolean;
  onPin: (id: string | null) => void;
  onMute: (id: string) => void;
  onDisableVideo: (id: string) => void;
  onSetRole: (id: string, role: 'host' | 'co-host' | 'attendee') => void;
  onRemove: (id: string) => void;
}

/** The "⋯" menu on a participant's tile. */
export const ParticipantTileMenu: React.FC<ParticipantTileMenuProps> = ({
  participant, layout, actions, isModerator, canMakeHost, role, isPinned,
  onPin, onMute, onDisableVideo, onSetRole, onRemove,
}) => {
  const id = participant.sessionId;
  const spotlit = layout.spotlightParticipants.includes(id);
  const onlyOne = spotlit && layout.spotlightParticipants.length === 1;
  const limit = layout.layoutMode === 'dual' ? MAX_DUAL_SPOTLIGHT : MAX_SPOTLIGHT;
  const full = !spotlit && layout.spotlightParticipants.length >= limit;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Options for ${participant.userName}`}
          className="flex items-center justify-center rounded bg-black/60 px-1.5 py-0.5 text-white hover:bg-black/80"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{participant.userName}{participant.isLocal ? ' (You)' : ''}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onPin(isPinned ? null : id)}>
          {isPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
          {isPinned ? 'Unpin' : 'Pin for me'}
        </DropdownMenuItem>
        {isModerator && (
          <>
            <DropdownMenuSeparator />
            {!onlyOne && (
              <DropdownMenuItem onClick={() => actions.spotlightOnly(id)}>
                <Sparkles className="mr-2 h-4 w-4" /> Spotlight for everyone
              </DropdownMenuItem>
            )}
            {spotlit ? (
              <DropdownMenuItem onClick={() => actions.removeFromSpotlight(id)}>
                <X className="mr-2 h-4 w-4" /> Remove from spotlight
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={full} onClick={() => actions.addToSpotlight(id)}>
                <Plus className="mr-2 h-4 w-4" /> Add to spotlight
                {full && <span className="ml-auto text-[10px] opacity-70">Full</span>}
              </DropdownMenuItem>
            )}
            {!participant.isLocal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onMute(id)}>
                  <MicOff className="mr-2 h-4 w-4" /> Mute
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDisableVideo(id)}>
                  <VideoOff className="mr-2 h-4 w-4" /> Disable video
                </DropdownMenuItem>
                {role === 'co-host' ? (
                  <DropdownMenuItem onClick={() => onSetRole(id, 'attendee')}>
                    <Shield className="mr-2 h-4 w-4" /> Remove co-host
                  </DropdownMenuItem>
                ) : role !== 'host' && (
                  <DropdownMenuItem onClick={() => onSetRole(id, 'co-host')}>
                    <Shield className="mr-2 h-4 w-4" /> Make co-host
                  </DropdownMenuItem>
                )}
                {canMakeHost && role !== 'host' && (
                  <DropdownMenuItem onClick={() => onSetRole(id, 'host')}>
                    <Crown className="mr-2 h-4 w-4" /> Make host
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => {
                    if (window.confirm(`Remove ${participant.userName} from the meeting?`)) onRemove(id);
                  }}
                >
                  <UserMinus className="mr-2 h-4 w-4" /> Remove participant
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const toolbarButton = (active: boolean) => `
  w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center relative
  transition-all duration-200 transform group-hover:scale-105
  ${active ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}
`;

/** Host toolbar: the meeting layout everyone sees, screen share and recording layouts. */
export const LayoutMenuButton: React.FC<{ layout: MeetingLayoutState; actions: LayoutActions }> = ({ layout, actions }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0">
        <div className={toolbarButton(false)}>
          <LayoutGrid className="h-5 w-5 sm:h-7 sm:w-7" />
        </div>
        <span className="hidden sm:block text-xs font-medium text-gray-300">Layout</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" className="w-60 max-h-[70vh] overflow-y-auto">
      <DropdownMenuLabel>Layout for everyone</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={layout.layoutMode} onValueChange={(v) => actions.setLayoutMode(v as LayoutMode)}>
        {LAYOUT_MODES.map((m) => (
          <DropdownMenuRadioItem key={m} value={m}>{LAYOUT_LABELS[m]}</DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {layout.layoutMode === 'dual' && (
        <DropdownMenuCheckboxItem
          checked={layout.showThumbnails}
          onCheckedChange={(v) => actions.setShowThumbnails(!!v)}
        >
          Show audience thumbnails
        </DropdownMenuCheckboxItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>When someone shares their screen</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={layout.screenShareMode} onValueChange={(v) => actions.setScreenShareMode(v as ScreenShareMode)}>
        {SCREEN_SHARE_MODES.map((m) => (
          <DropdownMenuRadioItem key={m} value={m}>{SCREEN_SHARE_LABELS[m]}</DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Recording layout</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={layout.recordingLayout} onValueChange={(v) => actions.setRecordingLayout(v as RecordingLayout)}>
        {RECORDING_LAYOUTS.map((m) => (
          <DropdownMenuRadioItem key={m} value={m}>{RECORDING_LABELS[m]}</DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

/** Host toolbar: who is spotlit, who could be, and the Dual Speaker controls. */
export const SpotlightPanelButton: React.FC<{
  layout: MeetingLayoutState;
  actions: LayoutActions;
  people: MenuPerson[];
}> = ({ layout, actions, people }) => {
  const byId = new Map<string, MenuPerson>(people.map((p) => [p.sessionId, p] as const));
  const spotlit = layout.spotlightParticipants;
  const available = people.filter((p) => !spotlit.includes(p.sessionId));
  const limit = layout.layoutMode === 'dual' ? MAX_DUAL_SPOTLIGHT : MAX_SPOTLIGHT;
  const full = spotlit.length >= limit;
  const name = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.userName}${p.isLocal ? ' (You)' : ''}` : 'Left the meeting';
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0">
          <div className={toolbarButton(spotlit.length > 0)}>
            <Sparkles className="h-5 w-5 sm:h-7 sm:w-7" />
            {spotlit.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-amber-600 text-xs font-semibold rounded-full h-5 w-5 flex items-center justify-center">
                {spotlit.length}
              </span>
            )}
          </div>
          <span className="hidden sm:block text-xs font-medium text-gray-300">Spotlight</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 p-0">
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground mb-1">
              SPOTLIGHTED ({spotlit.length}/{limit})
            </p>
            {spotlit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody yet. Add people below.</p>
            ) : (
              <ul className="space-y-1">
                {spotlit.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    <span className={`flex-1 truncate ${byId.has(id) ? '' : 'italic text-muted-foreground'}`}>{name(id)}</span>
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-muted"
                      aria-label={`Remove ${name(id)} from spotlight`}
                      onClick={() => actions.removeFromSpotlight(id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground mb-1">AVAILABLE</p>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone is spotlit.</p>
            ) : (
              <ul className="space-y-1">
                {available.map((p) => (
                  <li key={p.sessionId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{p.userName}{p.isLocal ? ' (You)' : ''}</span>
                    <button
                      type="button"
                      disabled={full}
                      className="rounded px-2 py-0.5 text-xs border hover:bg-muted disabled:opacity-40"
                      onClick={() => actions.addToSpotlight(p.sessionId)}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {full && (
              <p className="mt-1 text-xs text-muted-foreground">
                {layout.layoutMode === 'dual' ? 'Dual Speaker holds two people.' : `Up to ${MAX_SPOTLIGHT} people.`}
              </p>
            )}
          </div>
        </div>
        <div className="border-t p-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={spotlit.length === 0}
            className="rounded px-2 py-1 text-xs border hover:bg-muted disabled:opacity-40"
            onClick={actions.clearSpotlights}
          >
            Remove all
          </button>
          <button
            type="button"
            disabled={spotlit.length < 2}
            className="rounded px-2 py-1 text-xs border hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1"
            onClick={actions.swapSpeakers}
          >
            <ArrowLeftRight className="h-3 w-3" /> Swap speakers
          </button>
          <select
            aria-label="Change layout"
            className="rounded px-2 py-1 text-xs border bg-background"
            value={layout.layoutMode}
            onChange={(e) => actions.setLayoutMode(e.target.value as LayoutMode)}
          >
            {LAYOUT_MODES.map((m) => <option key={m} value={m}>{LAYOUT_LABELS[m]}</option>)}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
};
