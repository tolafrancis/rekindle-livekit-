import { registerPlugin } from '@capacitor/core';

/** JS interface for the native Android plugin (NativeScreenSharePlugin.kt, in each
 *  app's own android project) — see that file's header comment for why this
 *  exists: the WebView's own
 *  getDisplayMedia() is a non-functional stub on Android (defines the API,
 *  always rejects — see LiveKitRoomWrapper.ts's isLikelyMobileDevice), so
 *  screen share on native Android goes through this plugin instead, which
 *  opens a second native LiveKit connection and captures via MediaProjection.
 *  Registered per-app in each app's own MainActivity — there is no matching
 *  iOS implementation (no ios/ project exists in either app), so this plugin
 *  is only ever called when Capacitor.getPlatform() === 'android'. */
export interface NativeScreenSharePlugin {
  /** Opens the MediaProjection permission dialog, then connects to `url` with
   *  `token` (a publish-only "shadow" token from livekit-token's
   *  asScreenShareShadow path) and starts publishing the captured screen.
   *  Rejects if permission is denied or the connection/publish fails. */
  start(options: { url: string; token: string }): Promise<void>;
  /** Stops publishing, disconnects the shadow connection, and stops the
   *  foreground service. Resolves even if nothing was running. */
  stop(): Promise<void>;
}

export const NativeScreenShare = registerPlugin<NativeScreenSharePlugin>('NativeScreenShare');
