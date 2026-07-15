import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MinistryJoinLanding from "@/components/registration/MinistryJoinLanding";
import MinistryKiosk from "@/components/registration/MinistryKiosk";
import MemberMinistryProfile from "@/components/registration/MemberMinistryProfile";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import AdminPage from "./pages/AdminPage";
import LandingPage from "./pages/LandingPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import Skeleton from "./components/Skeleton";
import NotFound from "./pages/NotFound";
import UnsubscribePage from "./pages/UnsubscribePage";
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

const App = () => (
  <ErrorBoundary>
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <LanguageProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
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
              </BrowserRouter>
            </LanguageProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;