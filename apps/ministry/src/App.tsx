import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@rekindle/features/AuthContext';
import { LanguageProvider } from '@rekindle/features/LanguageContext';
import { CurrentMinistryProvider } from '@rekindle/features/CurrentMinistryContext';
import { useMinistryBranding } from '@rekindle/features/ministryBranding';
import { MinistrySwitcher } from '@rekindle/features/components/MinistrySwitcher';
import MinistriesHub from '@rekindle/ministry/components/MinistriesHub';
import MinistryJoinLanding from '@rekindle/ministry/components/MinistryJoinLanding';
import MinistryKiosk from '@rekindle/ministry/components/MinistryKiosk';
import AuthScreen from './screens/AuthScreen';

// Phase 5 — ministry-scoped entry. Public join/kiosk routes let members sign up
// straight into a specific ministry (QR / invite link / join-by-code / kiosk),
// reusing the server-side validate_join + claim_join_profile (find-or-create →
// attach, no duplicate accounts) flows. The rest of the app is auth-gated.

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
    </div>
  );
}

// Branded header — applies the current ministry's theme (via useMinistryBranding's
// side effect) and shows its logo/name. On white-label tiers the ReKindle wordmark
// is dropped; otherwise it shows as a small "powered by".
function BrandedHeader() {
  const { name, logoUrl, whiteLabel } = useMinistryBranding();
  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
      ) : null}
      <span className="font-semibold truncate">{name ?? 'Ministry'}</span>
      {!whiteLabel && (
        <span className="text-xs text-muted-foreground hidden sm:inline">· ReKindle</span>
      )}
      <div className="ml-auto">
        <MinistrySwitcher />
      </div>
    </header>
  );
}

function MinistryShell() {
  return (
    <CurrentMinistryProvider>
      <div className="min-h-screen bg-background text-foreground">
        <BrandedHeader />
        <main>
          <MinistriesHub />
        </main>
      </div>
    </CurrentMinistryProvider>
  );
}

function AppRoutes() {
  const { user, loading, initialized } = useAuth();
  const ready = !loading && initialized;

  return (
    <Routes>
      {/* Public ministry-scoped entry points — available regardless of auth. */}
      <Route path="/join/:slug" element={<MinistryJoinLanding />} />
      <Route path="/kiosk/:slug" element={<MinistryKiosk />} />

      {/* Auth-gated app. */}
      <Route
        path="/auth"
        element={!ready ? <LoadingScreen /> : user ? <Navigate to="/" replace /> : <AuthScreen />}
      />
      <Route
        path="/"
        element={!ready ? <LoadingScreen /> : user ? <MinistryShell /> : <Navigate to="/auth" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
