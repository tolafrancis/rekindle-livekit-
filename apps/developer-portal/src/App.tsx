import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@rekindle/ui/toaster';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LandingScreen from './screens/LandingScreen';
import SignUpScreen from './screens/SignUpScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';

// Standalone developer portal for the Interactive Meetings API — sign up,
// manage API keys, see usage. Deliberately its own app (not a tab inside the
// consumer or ministry apps): this serves outside companies with no ReKindle
// ministry/consumer relationship at all.

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/signup" element={<SignUpScreen />} />
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/dashboard" element={<RequireAuth><DashboardScreen /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
