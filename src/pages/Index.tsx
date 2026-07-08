import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { AppProvider } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { OnboardingFlow } from '@/components/auth/OnboardingFlow';
import { PasswordResetForm } from '@/components/auth/PasswordResetForm';
import LandingPage from '@/pages/LandingPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setDeepLink, DEEP_LINK_TAB } from '@/lib/deepLink';
import { SharedContentPreview } from '@/components/SharedContentPreview';

// Constants
const LOADING_TIMEOUT = 8000; // 8 seconds max loading time
const FALLBACK_TIMEOUT = 15000; // 15 seconds before showing fallback

// Helper to check URL for recovery parameters
const checkUrlForRecovery = (): boolean => {
  const hash = window.location.hash;
  const search = window.location.search;
  
  const hashParams = new URLSearchParams(hash.replace('#', '').replace('/', ''));
  const searchParams = new URLSearchParams(search);
  
  const isRecovery = 
    hashParams.get('type') === 'recovery' ||
    searchParams.get('type') === 'recovery' ||
    hash.includes('type=recovery') ||
    search.includes('type=recovery') ||
    (hash.includes('access_token') && hash.includes('recovery'));
  
  return isRecovery;
};

// Loading Fallback Component
const LoadingFallback: React.FC<{
  onRetry: () => void;
  onClearAndRetry: () => void;
  showExtendedOptions: boolean;
}> = ({ onRetry, onClearAndRetry, showExtendedOptions }) => (
  <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-700 to-purple-900 flex flex-col items-center justify-center gap-4 p-4">
    <Loader2 className="h-12 w-12 animate-spin text-white" />
    <p className="text-white/80 text-sm">Loading your spiritual journey...</p>
    
    {showExtendedOptions && (
      <div className="flex flex-col items-center gap-3 mt-4 bg-white/10 rounded-xl p-6 backdrop-blur-sm">
        <AlertTriangle className="h-6 w-6 text-amber-400" />
        <p className="text-white/90 text-sm text-center max-w-xs">
          Loading is taking longer than expected. This might be due to a slow connection.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="text-white border-white/30 hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAndRetry}
            className="text-white border-white/30 hover:bg-white/10"
          >
            Start Fresh
          </Button>
        </div>
      </div>
    )}
  </div>
);

// Auth Gate Component with proper state management
const AuthGate: React.FC = () => {
  const location = useLocation();
  const { 
    user, 
    profile, 
    loading, 
    initialized, 
    clearAuthState, 
    isRecoveryMode, 
    setRecoveryMode 
  } = useAuth();
  
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset'>('login');
  // Whether the auth form overlay is open (used for shared-content preview, where
  // we show the free taste first and only overlay auth once the visitor chooses).
  const [authOpen, setAuthOpen] = useState(false);
  const [showExtendedOptions, setShowExtendedOptions] = useState(false);
  const [forceShowContent, setForceShowContent] = useState(false);
  // True when an unauthenticated user arrives via a meeting join link
  const [isGuestJoining, setIsGuestJoining] = useState(false);
  
  // State for tab navigation from location state
  const [pendingRoomJoin, setPendingRoomJoin] = useState<{
    roomId: number;
    useVideo: boolean;
  } | null>(null);
  
  const [initialTab, setInitialTab] = useState<string | null>(null);
  
  // Refs to prevent duplicate operations
  const recoveryCheckRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  // Check for URL parameters (for meeting links)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const meetingId = params.get('meetingId');
    const channelId = params.get('channelId');
    const autoJoin = params.get('autoJoin');

    console.log('[Index] URL params:', { tab, meetingId, channelId, autoJoin });

    // Handle live-channels with meeting
    if (tab === 'live-channels' && meetingId && channelId && autoJoin === 'true') {
      setInitialTab('live-channels');
      
      // Store for LiveChannels to pick up
      sessionStorage.setItem('autoOpenMeetingId', meetingId);
      sessionStorage.setItem('autoOpenChannelId', channelId);
      
      // Allow guest (unauthenticated) users to proceed directly to the app
      setIsGuestJoining(true);
      
      console.log('[Index] Stored meeting info in sessionStorage');
    } else if (tab) {
      setInitialTab(tab);
    }
  }, [location.search]);

  // Shared content deep links: /devotional-series/:id, /prayer-series/:id,
  // /prayer-topics/:id, /prayer-watch/:id[/:slot], /books/:id.
  // Open the matching tab and stash the target so the screen opens the item.
  useEffect(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const type = segments[0];
    if (type && DEEP_LINK_TAB[type] && segments[1]) {
      setInitialTab(DEEP_LINK_TAB[type]);
      const ref = new URLSearchParams(location.search).get('ref') || undefined;
      setDeepLink({ type, id: segments[1], extra: segments[2], ref });
    }
  }, [location.pathname, location.search]);

  // Check for navigation state (legacy support)
  useEffect(() => {
    const state = location.state as { 
      joinRoom?: number; 
      useVideo?: boolean;
      openTab?: string;
      channelId?: string;
      openLiveChannels?: boolean;
      meetingId?: string;
      autoJoinMeeting?: boolean;
    } | null;
    
    if (state?.openTab) {
      setInitialTab(state.openTab);
    }

    if (state?.openLiveChannels) {
      setInitialTab('live-channels');
      
      // Store meeting info for LiveChannels to pick up
      if (state.meetingId && state.autoJoinMeeting) {
        sessionStorage.setItem('autoOpenMeetingId', state.meetingId);
        if (state.channelId) {
          sessionStorage.setItem('autoOpenChannelId', state.channelId);
        }
      }
    }
    
    if (state?.joinRoom) {
      // Legacy room joins are redirected to live-channels
      setInitialTab('live-channels');
    }
    
    // Clear the state to prevent re-triggering
    if (state) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);


  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    };
  }, []);

  // Check URL for password reset on mount
  useEffect(() => {
    if (recoveryCheckRef.current) return;
    recoveryCheckRef.current = true;
    
    const checkRecovery = () => {
      const isRecovery = checkUrlForRecovery();
      console.log('[Index] Recovery check result:', isRecovery);
      
      if (isRecovery && isMounted.current) {
        setAuthMode('reset');
        setRecoveryMode(true);
      }
    };

    checkRecovery();

    const handleHashChange = () => {
      if (isMounted.current) {
        checkRecovery();
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [setRecoveryMode]);

  // Handle recovery mode changes
  useEffect(() => {
    if (isRecoveryMode && isMounted.current) {
      console.log('[Index] isRecoveryMode is true, setting authMode to reset');
      setAuthMode('reset');
    }
  }, [isRecoveryMode]);

  // Loading timeout management
  useEffect(() => {
    // Clear existing timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);

    if (loading && !initialized) {
      // Show extended options after LOADING_TIMEOUT
      timeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          setShowExtendedOptions(true);
        }
      }, LOADING_TIMEOUT);

      // Force show content after FALLBACK_TIMEOUT
      fallbackTimeoutRef.current = setTimeout(() => {
        if (isMounted.current && loading) {
          console.warn('[Index] Fallback timeout reached, forcing content display');
          setForceShowContent(true);
        }
      }, FALLBACK_TIMEOUT);
    } else {
      setShowExtendedOptions(false);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    };
  }, [loading, initialized]);

  // Handlers
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  const handleClearAndRetry = useCallback(() => {
    clearAuthState();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  }, [clearAuthState]);

  const handleSwitchToLogin = useCallback(() => {
    setAuthMode('login');
    setRecoveryMode(false);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [setRecoveryMode]);

  // Show loading state (but not indefinitely)
  if (loading && !initialized && !forceShowContent) {
    return (
      <LoadingFallback
        onRetry={handleRetry}
        onClearAndRetry={handleClearAndRetry}
        showExtendedOptions={showExtendedOptions}
      />
    );
  }

  // If in recovery mode, show password reset form
  if (isRecoveryMode || authMode === 'reset') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-700 to-purple-900 flex items-center justify-center p-4">
        <PasswordResetForm onSwitchToLogin={handleSwitchToLogin} />
      </div>
    );
  }

  // Not logged in — show a preview of the shared item (free taste) for shared
  // content links, otherwise the marketing landing page. Auth forms overlay both.
  if (!user && !isGuestJoining) {
    const segs = location.pathname.split('/').filter(Boolean);
    const isSharedContent = Boolean(segs[0] && DEEP_LINK_TAB[segs[0]] && segs[1]);

    const backdrop = isSharedContent ? (
      <SharedContentPreview
        onSignUp={() => { setAuthMode('signup'); setAuthOpen(true); }}
        onSignIn={() => { setAuthMode('login'); setAuthOpen(true); }}
      />
    ) : (
      <LandingPage
        onSignIn={() => { setAuthMode('login'); setAuthOpen(true); }}
        onSignUp={() => { setAuthMode('signup'); setAuthOpen(true); }}
      />
    );

    // Visitors always land on the marketing page (or shared-content preview)
    // first. The auth form only overlays once the visitor intentionally taps
    // "Sign In" / "Sign Up" (both set authOpen), never on first visit.
    const showAuthOverlay = authOpen;

    if (showAuthOverlay) {
      return (
        <div>
          {/* Dim the backdrop (preview or landing) behind the auth form */}
          <div style={{ filter: 'blur(4px) brightness(0.5)', pointerEvents: 'none', userSelect: 'none' }}>
            {backdrop}
          </div>
          {/* Auth form overlay */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <button
              onClick={() => setAuthOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-700 shadow hover:bg-white"
            >
              {isSharedContent ? '← Back to preview' : '← Back'}
            </button>
            {authMode === 'login' && (
              <LoginForm
                onSwitchToSignup={() => setAuthMode('signup')}
                onSwitchToReset={() => setAuthMode('reset')}
                onSuccess={() => {}}
              />
            )}
            {authMode === 'signup' && (
              <SignupForm
                onSwitchToLogin={() => setAuthMode('login')}
                onSuccess={() => {}}
              />
            )}
          </div>
        </div>
      );
    }

    return backdrop;
  }

  // Logged in but needs onboarding (skip for guests joining meetings)
  if (!isGuestJoining && profile && !profile.onboarding_completed) {
    return (
      <ErrorBoundary>
        <OnboardingFlow onComplete={() => window.location.reload()} />
      </ErrorBoundary>
    );
  }

  // Fully authenticated - show main app
  return (
    <ErrorBoundary>
      <AppLayout 
        pendingRoomJoin={pendingRoomJoin} 
        onRoomJoinHandled={() => setPendingRoomJoin(null)}
        initialTab={initialTab}
      />
    </ErrorBoundary>
  );
};

// Main Index Component
const Index: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AuthGate />
      </AppProvider>
    </ErrorBoundary>
  );
};

export default Index;