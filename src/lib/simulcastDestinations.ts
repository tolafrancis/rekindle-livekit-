// src/lib/simulcastDestinations.ts
// Phase 1 (manual) restream destinations. Pre-filled RTMP server URLs so the
// operator usually only needs to paste a stream key. The Server URL field stays
// editable in the UI (defaults to these constants) in case a platform dashboard
// shows a different ingest endpoint.

export const SIMULCAST_DESTINATIONS = {
  youtube: {
    label: 'YouTube Live',
    defaultServerUrl: 'rtmp://a.rtmp.youtube.com/live2',
    // Operator may paste the RTMPS variant from YouTube's Live Control Room (lock icon) if preferred.
    helpUrl: 'https://youtube.com/livestreaming',
    keyHint: "YouTube Studio → Create → Go Live → Stream settings → 'Stream key' (use the reusable key).",
  },
  facebook: {
    label: 'Facebook Live',
    defaultServerUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    helpUrl: 'https://www.facebook.com/live/producer',
    keyHint: "facebook.com/live/producer → Streaming software → Advanced settings → enable 'Persistent stream key', copy 'Stream key'.",
  },
} as const;

export type SimulcastPlatform = keyof typeof SIMULCAST_DESTINATIONS;

/** Stable iteration order for rendering the destination cards. */
export const SIMULCAST_PLATFORMS = Object.keys(SIMULCAST_DESTINATIONS) as SimulcastPlatform[];
