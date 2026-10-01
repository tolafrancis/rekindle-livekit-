import React from 'react';
import { TranslationListenerButton } from '../components/TranslationListenerButton';

interface WebinarTranslationButtonProps {
  webinarId: string;
  /** The LiveKit room the webinar (and the bot) actually run in —
   *  ministry_webinars.room_name. */
  roomName: string;
  /** How many seconds behind real time the HLS video is expected to run —
   *  the translated audio is deliberately delayed by the same amount so the
   *  dub doesn't arrive before the viewer sees the speaker's mouth move.
   *  Pass the same value given to HlsPlayer's targetLatencySeconds. */
  delaySeconds: number;
  /** True whenever a real (non-Original) language is selected — the caller
   *  mutes the HLS video's own audio while this is true. */
  onActiveChange?: (active: boolean) => void;
  /** See TranslationListenerButton's showCaptionsOption. */
  showCaptionsOption?: boolean;
}

/**
 * Translation picker for HLS-viewing webinar attendees (WebinarAttendeeViewer
 * never joins the LiveKit room at all) — thin webinar-scoped wrapper around
 * the shared TranslationListenerButton (2026-09-23, captions pipeline
 * review Phase 4: this file and BroadcastTranslationButton.tsx were a
 * near-byte-identical duplicate pair, now collapsed into one shared
 * implementation). All actual connection, audio-sync, and captions logic —
 * and every real-bug fix in its history — lives there now.
 */
export const WebinarTranslationButton: React.FC<WebinarTranslationButtonProps> = ({
  webinarId,
  roomName,
  delaySeconds,
  onActiveChange,
  showCaptionsOption,
}) => (
  <TranslationListenerButton
    scopeId={webinarId}
    scopeKind="webinar"
    roomName={roomName}
    delaySeconds={delaySeconds}
    onActiveChange={onActiveChange}
    startCaptionsSession={{ rpc: 'start_webinar_captions_session', params: { p_webinar_id: webinarId } }}
    showCaptionsOption={showCaptionsOption}
  />
);

export default WebinarTranslationButton;
