import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useNavigate } from 'react-router-dom';
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
import BillingSettings from '@rekindle/ministry/components/BillingSettings';
import MemberAccountSettings from '@rekindle/ministry/components/MemberAccountSettings';
import { ScrollToTopButton } from '@rekindle/features/components/ScrollToTopButton';
import { OnboardingTips } from '@rekindle/features/components/OnboardingTips';
import { User, CreditCard, Globe, LogOut } from 'lucide-react';
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
  const { currentMinistry } = useCurrentMinistry();
  const { profile, signOut } = useAuth();
  // Billing & Domain are leader/admin concerns; regular members see only Account.
  const canManage = !!(currentMinistry?.isLeader || currentMinistry?.isOwner || currentMinistry?.role === 'admin');
  const firstName = (profile?.full_name || '').trim().split(' ')[0];
  const iconBtn = 'flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm transition-transform hover:scale-105';
  return (
    <header className="flex h-14 items-center gap-3 border-b px-3 sm:px-4">
      {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-8 rounded object-cover" /> : null}
      <Link to="/" className="font-semibold truncate hover:opacity-80">{name ?? 'Ministry'}</Link>
      {!whiteLabel && <span className="text-xs text-muted-foreground hidden sm:inline">· ReKindle</span>}
      <div className="ml-auto flex items-center gap-2">
        {firstName && <span className="hidden md:inline text-sm text-muted-foreground mr-1">Welcome back, {firstName}</span>}
        <Link to="/settings/account" aria-label="Account" title="Account" className={`${iconBtn} bg-gradient-to-br from-indigo-500 to-purple-600`}>
          <User className="h-4 w-4" />
        </Link>
        {canManage && (
          <>
            <Link to="/settings/billing" aria-label="Billing" title="Billing" className={`${iconBtn} bg-gradient-to-br from-sky-500 to-blue-600`}>
              <CreditCard className="h-4 w-4" />
            </Link>
            <Link to="/settings/domain" aria-label="Domain" title="Domain" className={`${iconBtn} bg-gradient-to-br from-emerald-500 to-teal-600`}>
              <Globe className="h-4 w-4" />
            </Link>
          </>
        )}
        <button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className={`${iconBtn} bg-gradient-to-br from-rose-500 to-red-600`}>
          <LogOut className="h-4 w-4" />
        </button>
        <MinistrySwitcher />
      </div>
    </header>
  );
}

// Inside CurrentMinistryProvider: members with no ministry self-onboard; everyone else
// gets the branded shell with the child route rendered in <Outlet/>.
function AuthedShell() {
  const { ministries, loading } = useCurrentMinistry();
  const navigate = useNavigate();
  if (loading) return <LoadingScreen />;
  if (ministries.length === 0) return <CreateMinistryWizard />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandedHeader />
      <main>
        <Outlet />
      </main>
      <ScrollToTopButton />
      {/* One-time welcome tips (ReKindle Tips) */}
      <OnboardingTips onNavigate={() => navigate('/')} />
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
        <Route path="/settings/account" element={<MemberAccountSettings />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/settings/domain" element={<CustomDomainSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}
