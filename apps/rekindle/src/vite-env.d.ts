/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Base URL of the separate Ministry app deployment (e.g. https://rekindlebc.com) — the
   *  landing page's Ministry Partner CTA sends visitors there for checkout, since billing
   *  lives in that app, not this one. Falls back to https://rekindlebc.com if unset. */
  readonly VITE_MINISTRY_APP_URL?: string;
  /** Base URL of this consumer app's own deployment (e.g. https://app.rekindlebc.com) —
   *  used by the shared landing page when rendered from the Ministry app, so its
   *  Individual Partner CTA and legal-page links point back here. Falls back to
   *  https://app.rekindlebc.com if unset. */
  readonly VITE_CONSUMER_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
