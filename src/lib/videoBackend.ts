/**
 * Video backend selector. LiveKit is now the only backend — the Daily engine and
 * the `VITE_VIDEO_BACKEND` flag were removed once the LiveKit migration completed.
 *
 * `isLiveKitBackend()` is kept (always true) so the many call sites that branch on it
 * across the app keep compiling; they can be simplified in a later cosmetic pass.
 *
 * The LiveKit wrapper is still loaded via dynamic import so `livekit-client` lands in
 * its own split chunk rather than the main bundle.
 */
import type { IVideoRoomWrapper, VideoWrapperCallbacks, VideoBackend } from '@/types/videoRoom';

export function getVideoBackend(): VideoBackend {
  return 'livekit';
}

export const isLiveKitBackend = (): boolean => true;

/** Construct the LiveKit wrapper. Async because the engine is code-split. */
export async function createVideoWrapper(
  callbacks?: VideoWrapperCallbacks,
): Promise<IVideoRoomWrapper> {
  const { LiveKitRoomWrapper } = await import('@/lib/LiveKitRoomWrapper');
  return new LiveKitRoomWrapper(callbacks) as unknown as IVideoRoomWrapper;
}
