import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@rekindle/features/AuthContext';
import { LanguageProvider } from '@rekindle/features/LanguageContext';
import { CurrentMinistryProvider } from '@rekindle/features/CurrentMinistryContext';
import { MinistrySwitcher } from '@rekindle/features/components/MinistrySwitcher';
import MinistriesHub from '@rekindle/ministry/components/MinistriesHub';
import AuthScreen from './screens/AuthScreen';

// Phase 2/3 — the standalone Ministry app: shared providers + routing + auth gate
// + current-ministry context. Authenticated members get a ministry switcher and
// land in their current ministry (single-membership fast-path). Everything is
// rendered from the shared @rekindle/* packages.
function MinistryShell() {
  return (
    <CurrentMinistryProvider>
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <span className="font-semibold">ReKindle Ministry</span>
          <div className="ml-auto">
            <MinistrySwitcher />
          </div>
        </header>
        <main>
          <MinistriesHub />
        </main>
      </div>
    </CurrentMinistryProvider>
  );
}

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
          <Route path="/" element={<MinistryShell />} />
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
