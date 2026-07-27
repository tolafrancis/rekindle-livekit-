import { useEffect } from 'react';
import { toast } from '@rekindle/ui/use-toast';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@rekindle/features/AuthContext';
import { LanguageProvider } from '@rekindle/features/LanguageContext';
import { CurrentMinistryProvider, useCurrentMinistry } from '@rekindle/features/CurrentMinistryContext';
import { useMinistryBranding } from '@rekindle/features/ministryBranding';
import { canShowPurchaseUI } from '@rekindle/features/platform';
import { MinistrySwitcher } from '@rekindle/features/components/MinistrySwitcher';
import MinistriesHub from '@rekindle/ministry/components/MinistriesHub';
import MinistryJoinLanding from '@rekindle/ministry/components/MinistryJoinLanding';
import MinistryKiosk from '@rekindle/ministry/components/MinistryKiosk';
import CreateMinistryWizard from '@rekindle/ministry/components/CreateMinistryWizard';
import CustomDomainSettings from '@rekindle/ministry/components/CustomDomainSettings';
import BillingSettings from '@rekindle/ministry/components/BillingSettings';
import MemberAccountSettings from '@rekindle/ministry/components/MemberAccountSettings';
import { ScrollToTopButton } from '@rekindle/features/components/ScrollToTopButton';
import { OnboardingTips, MINISTRY_LEADER_TIPS, MINISTRY_MEMBER_TIPS } from '@rekindle/features/components/OnboardingTips';
import { User, CreditCard, Globe, LogOut, ArrowLeft } from 'lucide-react';
import { ThemeProvider } from '@rekindle/ui/theme-provider';
import { Toaster } from '@rekindle/ui/toaster';
import { Toaster as Sonner } from '@rekindle/ui/sonner';
import { ChannelWatchPage } from '@rekindle/live/components/ChannelWatchPage';
import { MeetingJoinPage } from '@rekindle/live/components/MeetingJoinPage';
import { ActiveCallProvider } from '@rekindle/live/ActiveCallContext';
import { GlobalAudioProvider } from '@rekindle/features/GlobalAudioContext';
import { ActiveCallHost } from '@rekindle/live/components/ActiveCallHost';
import MinistryLiveWrapper from '@rekindle/ministry/components/MinistryLiveWrapper';
import LandingPage from '@rekindle/features/components/LandingPage';
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
  const location = useLocation();
  // Billing & Domain are leader/admin concerns; regular members see only Account.
  const canManage = !!(currentMinistry?.isLeader || currentMinistry?.isOwner || currentMinistry?.role === 'admin');
  // Native builds ship with no purchase surfaces (Phase 0 — Apple 3.1.1).
  const showBilling = canManage && canShowPurchaseUI();
  const firstName = (profile?.full_name || '').trim().split(' ')[0];
  const iconBtn = 'flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm transition-transform hover:scale-105';
  return (
    <header className="flex h-14 items-center gap-3 border-b px-3 sm:px-4">
      {location.pathname !== '/' && (
        <Link to="/" aria-label="All Ministries" title="All Ministries"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground shrink-0">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">All Ministries</span>
        </Link>
      )}
      {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-8 rounded object-cover" /> : null}
      <Link to="/" className="font-semibold truncate hover:opacity-80">{name ?? 'Ministry'}</Link>
      {!whiteLabel && <span className="text-xs text-muted-foreground hidden sm:inline">· ReKindle</span>}
      <div className="ml-auto flex items-center gap-2">
        {firstName && <span className="hidden md:inline text-sm text-muted-foreground mr-1">Welcome back, {firstName}</span>}
        <Link to="/settings/account" aria-label="Account" title="Account" className={`${iconBtn} bg-gradient-to-br from-indigo-500 to-purple-600`}>
          <User className="h-4 w-4" />
        </Link>
        {showBilling && (
          <Link to="/settings/billing" aria-label="Billing" title="Billing" className={`${iconBtn} bg-gradient-to-br from-sky-500 to-blue-600`}>
            <CreditCard className="h-4 w-4" />
          </Link>
        )}
        {canManage && (
          <Link to="/settings/domain" aria-label="Domain" title="Domain" className={`${iconBtn} bg-gradient-to-br from-emerald-500 to-teal-600`}>
            <Globe className="h-4 w-4" />
          </Link>
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
  const { ministries, loading, currentMinistry } = useCurrentMinistry();
  const { name } = useMinistryBranding();
  const navigate = useNavigate();
  if (loading) return <LoadingScreen />;
  if (ministries.length === 0) return <CreateMinistryWizard />;
  // Members and leaders both get onboarding, but different sets: leaders get the
  // devotional-SOURCE tip (they choose it); members don't (their leader sets it).
  const isLeader = !!(currentMinistry?.isLeader || currentMinistry?.isOwner || currentMinistry?.role === 'admin');
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandedHeader />
      <main>
        <Outlet />
      </main>
      <ScrollToTopButton />
      {/* One-time welcome tips, titled with the ministry's own name. */}
      <OnboardingTips
        title={`Welcome to ${name ?? 'your ministry'}`}
        subtitle={isLeader ? 'A few things to help you set up your ministry.' : 'A few things to help you get started.'}
        tips={isLeader ? MINISTRY_LEADER_TIPS : MINISTRY_MEMBER_TIPS}
        storageKey={isLeader ? 'rekindle_ministry_leader_tips_v1' : 'rekindle_ministry_member_tips_v1'}
        primaryAction={null}
      />
    </div>
  );
}

// Layout route: gates auth, then provides the current-ministry context to its children.
// The root path is special-cased for logged-out visitors: rather than bouncing
// straight to /auth, it shows the shared marketing landing page (same one the
// consumer app uses) — rekindlebc.com and app.rekindlebc.com present the same
// front door. Other authed paths (settings/*) still redirect to /auth as before.
function AuthedArea() {
  const { user, loading, initialized } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (loading || !initialized) return <LoadingScreen />;
  if (!user) {
    if (location.pathname === '/') {
      return (
        <LandingPage
          appContext="ministry"
          onSignIn={() => navigate('/auth')}
          onSignUp={() => navigate('/auth', { state: { mode: 'signup' } })}
        />
      );
    }
    return <Navigate to="/auth" replace />;
  }
  return (
    <CurrentMinistryProvider>
      <AuthedShell />
    </CurrentMinistryProvider>
  );
}

function AuthRoute() {
  const { user, loading, initialized } = useAuth();
  const location = useLocation();
  if (loading || !initialized) return <LoadingScreen />;
  return user ? <Navigate to="/" replace /> : <AuthScreen initialView={(location.state as { mode?: 'login' | 'signup' } | null)?.mode} />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public ministry-scoped entry points. */}
      <Route path="/join/:slug" element={<MinistryJoinLanding />} />
      <Route path="/kiosk/:slug" element={<MinistryKiosk />} />
      <Route path="/auth" element={<AuthRoute />} />

      {/* Public live-broadcast watch link (channel Share builds /channels/:id).
          Mounted OUTSIDE the auth gate so guests can watch without an account. */}
      <Route path="/channels/:id" element={<ChannelWatchPage context="ministry" />} />

      {/* Public guest meeting-join links — same self-contained flow as the consumer
          app, so a shared ministry meeting link shows the guest join page (name
          entry + optional sign-in) instead of forcing sign-up. The join page then
          routes into the live room below. All OUTSIDE the auth gate. */}
      <Route path="/ministry/:ministryId/meeting/:meetingId" element={<MeetingJoinPage />} />
      <Route path="/channel/:channelId/meeting/:meetingId" element={<MeetingJoinPage />} />
      <Route path="/ministries/:ministryId/live" element={<MinistryLiveWrapper />} />

      {/* Authed area (current-ministry context). */}
      <Route element={<AuthedArea />}>
        <Route path="/" element={<MinistriesHub />} />
        <Route path="/settings/account" element={<MemberAccountSettings />} />
        {/* Billing is web-only: native builds ship without purchase surfaces
            (Phase 0 — Apple 3.1.1). Deep-linking it natively lands on Home. */}
        <Route
          path="/settings/billing"
          element={canShowPurchaseUI() ? <BillingSettings /> : <Navigate to="/" replace />}
        />
        <Route path="/settings/domain" element={<CustomDomainSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const PushNotificationNavHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handlePushNav = (e: Event) => {
      const link = (e as CustomEvent).detail?.link as string;
      if (!link) return;
      // Strip the origin if present, keep just the path
      try {
        const url = new URL(link, window.location.origin);
        navigate(url.pathname + url.search + url.hash);
      } catch {
        navigate(link);
      }
    };
    window.addEventListener('pushNotificationNav', handlePushNav);
    return () => window.removeEventListener('pushNotificationNav', handlePushNav);
  }, [navigate]);

  return null;
};

export default function App() {
  useEffect(() => {
    const handler = (e: Event) => {
      const notification = (e as CustomEvent).detail;
      toast({
        title: notification.title || 'Notification',
        description: notification.body || '',
      });
    };
    window.addEventListener('nativePushReceived', handler);
    return () => window.removeEventListener('nativePushReceived', handler);
  }, []);

  // ThemeProvider MUST wrap the tree: the Sonner toaster calls useTheme(),
  // which throws (blanking the whole app) when no provider is present.
  return (
    <ThemeProvider defaultTheme="light">
      <AuthProvider>
        <LanguageProvider>
          <GlobalAudioProvider>
            <ActiveCallProvider>
            {/* Toast renderers — without these mounted, every toast() call in the
                ministry app (channel/meeting copy confirmations, etc.) is silent.
                Toaster reads @rekindle/ui/use-toast; Sonner renders sonner toasts. */}
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <PushNotificationNavHandler />
              <AppRoutes />
              {/* Persistent meeting layer — keeps a live call mounted across
                  navigation and shows the minimized mini-player. */}
              <ActiveCallHost />
            </BrowserRouter>
            </ActiveCallProvider>
          </GlobalAudioProvider>
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
