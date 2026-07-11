// Facade shim — the Supabase client now lives in the shared workspace package
// @rekindle/supabase. Re-exported here so the app's existing `@/lib/supabase`
// import sites (and the singleton client instance) stay unchanged. The standalone
// ministry app imports `@rekindle/supabase` directly.
export * from '@rekindle/supabase';
