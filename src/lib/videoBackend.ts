/**
 * Video backend selector (Phase 2). Chooses the media engine behind the
 * `UseDailyRoomReturn` seam from the `VITE_VIDEO_BACKEND` build-time flag:
 *   'daily'   (default) → EnhancedDailyVideoWrapper (current, production)
 *   'livekit'          → LiveKitRoomWrapper (lazy-loaded; pulls livekit-client)
 *
 * The LiveKit wrapper is loaded via dynamic import so `livekit-client` lands in its
 * own split chunk and is only fetched when the flag is actually 'livekit'.
 */
import { EnhancedDailyVideoWrapper } from '@/lib/EnhancedDailyVideoWrapper';
import type { IVideoRoomWrapper, VideoWrapperCallbacks, VideoBackend } from '@/types/videoRoom';

export function getVideoBackend(): VideoBackend {
  const v = String(import.meta.env.VITE_VIDEO_BACKEND ?? 'daily').toLowerCase();
  return v === 'livekit' ? 'livekit' : 'daily';
}

export const isLiveKitBackend = (): boolean => getVideoBackend() === 'livekit';

/** Construct the wrapper for the active backend. Async because the LiveKit engine
 *  is code-split. Both wrappers share the method names the hook calls. */
export async function createVideoWrapper(
  callbacks?: VideoWrapperCallbacks,
): Promise<IVideoRoomWrapper> {
  if (isLiveKitBackend()) {
    const { LiveKitRoomWrapper } = await import('@/lib/LiveKitRoomWrapper');
    return new LiveKitRoomWrapper(callbacks) as unknown as IVideoRoomWrapper;
  }
  // Daily wrapper predates the normalized callback types; its participant args are
  // Daily-shaped and the hook converts them. Shapes are compatible at the call sites.
  return new EnhancedDailyVideoWrapper(
    callbacks as unknown as ConstructorParameters<typeof EnhancedDailyVideoWrapper>[0],
  ) as unknown as IVideoRoomWrapper;
}
