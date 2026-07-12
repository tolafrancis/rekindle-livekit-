import { BrowserRouter, Routes, Route, Navigate, Outlet, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from '@rekindle/features/AuthContext';
import { LanguageProvider } from '@rekindle/features/LanguageContext';
import { CurrentMinistryProvider, useCurrentMinistry } from '@rekindle/features/CurrentMinistryContext';
import { useMinistryBranding } from '@rekindle/features/ministryBranding';
import { MinistrySwitcher } from '@rekindle/features/components/MinistrySwitcher';
import MinistriesHub from '@rekindle/ministry/components/MinistriesHub';
import MinistryJoinLanding from '@rekindle/ministry/components/MinistryJoinLanding';
import MinistryKiosk from '@rekindle/ministry/components/MinistryKiosk';
import CreateMinistryWizard from '@rekindle/ministry/components/CreateMinistryWizard';
import CustomDomainSettings from '@rekindle/ministry/components/CustomDomainSettings';
import AuthScreen from './screens/AuthScreen';

// Phase 2/3/6 — standalone Ministry app: shared providers + routing. Public join/kiosk
// entry, an auth gate, self-onboarding for members with no ministry, and an authed
// area (current-ministry context) hosting the hub + ministry settings.

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
    </div>
  );
}

function BrandedHeader() {
  const { name, logoUrl, whiteLabel } = useMinistryBranding();
  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-8 rounded object-cover" /> : null}
      <Link to="/" className="font-semibold truncate hover:opacity-80">{name ?? 'Ministry'}</Link>
      {!whiteLabel && <span className="text-xs text-muted-foreground hidden sm:inline">· ReKindle</span>}
      <nav className="ml-auto flex items-center gap-3">
        <Link to="/settings/domain" className="text-sm text-muted-foreground hover:text-foreground">
          Settings
        </Link>
        <MinistrySwitcher />
      </nav>
    </header>
  );
}

// Inside CurrentMinistryProvider: members with no ministry self-onboard; everyone else
// gets the branded shell with the child route rendered in <Outlet/>.
function AuthedShell() {
  const { ministries, loading } = useCurrentMinistry();
  if (loading) return <LoadingScreen />;
  if (ministries.length === 0) return <CreateMinistryWizard />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandedHeader />
      <main>
        <Outlet />
      </main>
    </div>
  );
}

// Layout route: gates auth, then provides the current-ministry context to its children.
function AuthedArea() {
  const { user, loading, initialized } = useAuth();
  if (loading || !initialized) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <CurrentMinistryProvider>
      <AuthedShell />
    </CurrentMinistryProvider>
  );
}

function AuthRoute() {
  const { user, loading, initialized } = useAuth();
  if (loading || !initialized) return <LoadingScreen />;
  return user ? <Navigate to="/" replace /> : <AuthScreen />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public ministry-scoped entry points. */}
      <Route path="/join/:slug" element={<MinistryJoinLanding />} />
      <Route path="/kiosk/:slug" element={<MinistryKiosk />} />
      <Route path="/auth" element={<AuthRoute />} />

      {/* Authed area (current-ministry context). */}
      <Route element={<AuthedArea />}>
        <Route path="/" element={<MinistriesHub />} />
        <Route path="/settings/domain" element={<CustomDomainSettings />} />
      </Route>

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
