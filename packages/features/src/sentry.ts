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
  });
}
