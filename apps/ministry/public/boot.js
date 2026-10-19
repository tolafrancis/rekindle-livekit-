// Runs before the app bundle. A signed-out visitor on "/" is about to see the
// dark landing page, so paint its background now: otherwise the first frames
// are the app's light "Loading…" page, which flashed light-to-dark on every
// visit. Removed again by the app once anything else is shown (App.tsx).
// The session lives under supabase's storageKey 'kindled-auth-token'
// (packages/supabase/src/supabase.ts) plus AuthContext's 'kindled_user'.
try {
  if (
    location.pathname === '/' &&
    !localStorage.getItem('kindled-auth-token') &&
    !localStorage.getItem('kindled_user')
  ) {
    document.documentElement.classList.add('rk-dark-boot');
  }
} catch (e) {
  /* storage blocked: keep the default look */
}
