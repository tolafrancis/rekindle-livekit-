import { useEffect } from "react";
import { toast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import MinistryJoinLanding from "@/components/registration/MinistryJoinLanding";
import MinistryKiosk from "@/components/registration/MinistryKiosk";
import MemberMinistryProfile from "@/components/registration/MemberMinistryProfile";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ActiveCallProvider } from "@rekindle/live/ActiveCallContext";
import { GlobalAudioProvider } from "@rekindle/features/GlobalAudioContext";
import { ActiveCallHost } from "@rekindle/live/components/ActiveCallHost";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import AdminPage from "./pages/AdminPage";
import LandingPage from "./pages/LandingPage";
import PrivacyPolicyPage from "@rekindle/features/components/PrivacyPolicyPage";
import TermsOfServicePage from "@rekindle/features/components/TermsOfServicePage";
import UnsubscribePage from "@rekindle/features/components/UnsubscribePage";
import Skeleton from "./components/Skeleton";
import NotFound from "./pages/NotFound";
import { BackToTop } from "./components/BackToTop";
// Import the wrapper component that renders MLiveChannel (same architecture as LiveChannels)
import MinistryLiveWrapper from "./components/MinistryLiveWrapper";
import { ChannelWatchPage } from "@rekindle/live/components/ChannelWatchPage";

// Configure QueryClient with better defaults for stability
// FIXED: Added refetchOnMount: false and refetchInterval: false to prevent auto-refreshes
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10 * 60 * 1000, // Increased from 5 to 10 minutes
      gcTime: 30 * 60 * 1000, // Increased from 10 to 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false, // ADDED: Prevent refetch when component mounts
      refetchInterval: false, // ADDED: Disable automatic interval refetching
    },
    mutations: {
      retry: 1,
    },
  },
});

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

const App = () => {
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

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <LanguageProvider>
              <GlobalAudioProvider>
                <ActiveCallProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <PushNotificationNavHandler />
                  <Routes>
                  {/* Main routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/admin" element={<AdminPage />} />

                  {/* Shared content deep links — render the app shell; the target
                      screen opens the specific item via the deep-link bridge. */}
                  <Route path="/devotional-series/:id" element={<Index />} />
                  <Route path="/daily-devotional/:id" element={<Index />} />
                  <Route path="/ministry-devotional/:id" element={<Index />} />
                  <Route path="/prayer-series/:id" element={<Index />} />
                  <Route path="/prayer-topics/:id" element={<Index />} />
                  <Route path="/prayer-watch/:id" element={<Index />} />
                  <Route path="/prayer-watch/:id/:slot" element={<Index />} />
                  <Route path="/ministry-prayer/:id" element={<Index />} />
                  <Route path="/ministry-videos/:id" element={<Index />} />
                  <Route path="/books/:id" element={<Index />} />
                  
                  {/* Meeting join routes - Channel meetings */}
                  <Route path="/channel/:channelId/meeting/:meetingId" element={<Skeleton />} />
                  
                  {/* Meeting join routes - Ministry meetings */}
                  <Route path="/ministry/:ministryId/meeting/:meetingId" element={<Skeleton />} />
                  
                  {/* Public live-broadcast watch link (channel Share builds /channels/:id).
                      Renders LiveChannelViewer directly — guests can watch without signing in. */}
                  <Route path="/channels/:id" element={<ChannelWatchPage />} />

                  {/* MinistryLiveWrapper renders MLiveChannel (same architecture as LiveChannels) */}
                  <Route path="/ministries/:ministryId/live" element={<MinistryLiveWrapper />} />

                  {/* Ministry member registration landing */}
                  <Route path="/register/:slug" element={<MinistryJoinLanding />} />
                  <Route path="/kiosk/:slug" element={<MinistryKiosk />} />
                  <Route path="/my-membership/:slug" element={<MemberMinistryProfile />} />

                  {/* In-app tabs as clean single-segment paths (/home, /devotional-library,
                      …). Ranks below every static route above, so /admin, /landing, etc.
                      keep their own components; only unmatched single-segment paths land
                      here and render the app shell, which resolves the tab. */}
                  <Route path="/:tab" element={<Index />} />

                  {/* 404 catch-all */}
                  <Route path="/unsubscribe" element={<UnsubscribePage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms" element={<TermsOfServicePage />} />
                  <Route path="/landing" element={
                    <LandingPage
                      onSignIn={() => window.location.href = '/'}
                      onSignUp={() => window.location.href = '/'}
                    />
                  } />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                {/* Universal back-to-top — available on every route, no per-page wiring */}
                <BackToTop />
                {/* Persistent meeting layer — keeps a live call mounted across tab
                    navigation and shows the minimized mini-player. */}
                <ActiveCallHost />
              </BrowserRouter>
              </ActiveCallProvider>
              </GlobalAudioProvider>
            </LanguageProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
  );
};

export default App;