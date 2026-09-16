import { useState } from 'react';
import { LoginForm } from '@rekindle/features/components/LoginForm';
import { SignupForm } from '@rekindle/features/components/SignupForm';
import { PasswordResetForm } from '@rekindle/features/components/PasswordResetForm';

type View = 'login' | 'signup' | 'reset';

// Unauthenticated entry for the Ministry app. Reuses the shared auth forms from
// @rekindle/features; on success the AuthProvider updates and the app routes the
// member into their ministry space.
export default function AuthScreen({ onSuccess, initialView }: { onSuccess?: () => void; initialView?: View }) {
  const [view, setView] = useState<View>(initialView ?? 'login');

  if (view === 'login') {
    return (
      <LoginForm
        onSwitchToSignup={() => setView('signup')}
        onSwitchToReset={() => setView('reset')}
        onSuccess={onSuccess || (() => {})}
      />
    );
  }

  if (view === 'signup') {
    return (
      <SignupForm
        onSwitchToLogin={() => setView('login')}
        onSuccess={onSuccess || (() => {})}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-700 to-purple-900 flex items-center justify-center p-6">
      <PasswordResetForm onSwitchToLogin={() => setView('login')} />
    </div>
  );
}

