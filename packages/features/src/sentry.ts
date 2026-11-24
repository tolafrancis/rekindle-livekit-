import * as Sentry from '@sentry/react';

interface InitSentryOptions {
  dsn?: string;
  appName: 'ministry' | 'rekindle';
}

// No-op until VITE_SENTRY_DSN is configured — safe to call unconditionally
// from both apps' main.tsx regardless of whether Sentry has been set up yet.
export function initSentry({ dsn, appName }: InitSentryOptions) {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    initialScope: { tags: { app: appName } },
    tracesSampleRate: 0,
    beforeSend(event) {
      // livekit-client renegotiates internally without catching failures
      // (RTCEngine onMediaSectionsRequirement → negotiate(), and the
      // un-awaited unpublishTrack in handleTrackEnded). A timed-out
      // negotiation there surfaces as an UNHANDLED NegotiationError, but the
      // SDK has already started a full reconnect itself, so it isn't
      // actionable. Ones our own code catches are still reported.
      const ex = event.exception?.values?.[0];
      if (ex?.type === 'NegotiationError' && ex.mechanism?.handled === false) return null;
      // An UNHANDLED AbortError ("The operation was aborted.", Safari's
      // wording) is a cancelled request or media play() that a library
      // dropped on the floor, typically while a meeting is torn down: leaving
      // the room aborts LiveKit's pending signalling/region fetches and any
      // video element mid-play(). Nothing failed for the user, so don't
      // report it. AbortErrors our own code catches and reports still arrive.
      if (ex?.type === 'AbortError' && ex.mechanism?.handled === false) return null;
      return event;
    },
  });
}
