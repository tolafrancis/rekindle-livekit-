import React from 'react';
import { TranslationListenerButton } from './TranslationListenerButton';

interface BroadcastTranslationButtonProps {
  channelId: string;
  /** The LiveKit room the broadcast (and the bot) actually run in — same
   *  string LiveChannelViewer already computes for its own room join, so
   *  callers should pass that exact value rather than re-deriving it. */
  roomName: string;
  /** How many seconds behind real time the HLS video is expected to run —
   *  the translated audio is deliberately delayed by the same amount so the
   *  dub doesn't arrive before the viewer sees the speaker's mouth move.
   *  Pass the same value given to HlsPlayer's targetLatencySeconds. */
  delaySeconds: number;
  /** True whenever a real (non-Original) language is selected — the caller
   *  mutes the HLS video's own audio while this is true, same idea as the
   *  meeting picker muting the room's other mics. */
  onActiveChange?: (active: boolean) => void;
}

/**
 * Translation picker for HLS-viewing broadcast audience (see
 * LiveChannelViewer.tsx's watchViaHls / isSpeaker split) — thin
 * broadcast-scoped wrapper around the shared TranslationListenerButton
 * (2026-09-23, captions pipeline review Phase 4: this file and
 * WebinarTranslationButton.tsx were a near-byte-identical duplicate pair,
 * now collapsed into one shared implementation). All actual connection,
 * audio-sync, and captions logic — and every real-bug fix in its history —
 * lives there now.
 */
export const BroadcastTranslationButton: React.FC<BroadcastTranslationButtonProps> = ({
  channelId,
  roomName,
  delaySeconds,
  onActiveChange,
}) => (
  <TranslationListenerButton
    scopeId={channelId}
    scopeKind="broadcast"
    roomName={roomName}
    delaySeconds={delaySeconds}
    onActiveChange={onActiveChange}
    startCaptionsSession={{ rpc: 'start_captions_session', params: { p_channel_id: channelId } }}
  />
);

export default BroadcastTranslationButton;
