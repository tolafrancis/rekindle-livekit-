import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@rekindle/features/AuthContext';
import { LanguageProvider } from '@rekindle/features/LanguageContext';
import MinistriesHub from '@rekindle/ministry/components/MinistriesHub';
import AuthScreen from './screens/AuthScreen';

// Phase 2 — the standalone Ministry app: shared providers + routing + auth gate.
// Unauthenticated members land on the sign-in screen; authenticated members are
// routed into the ministry hub (discovery -> their ministry space). Everything is
// rendered from the shared @rekindle/* packages.
function Gate() {
  const { user, loading, initialized } = useAuth();

  if (loading || !initialized) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      {!user ? (
        <>
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </>
      ) : (
        <>
          <Route
            path="/"
            element={
              <div className="min-h-screen bg-background text-foreground">
                <MinistriesHub />
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
