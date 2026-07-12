import { useState } from 'react';
import { LoginForm } from '@rekindle/features/components/LoginForm';
import { SignupForm } from '@rekindle/features/components/SignupForm';
import { PasswordResetForm } from '@rekindle/features/components/PasswordResetForm';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';

type View = 'login' | 'signup' | 'reset';

// Unauthenticated entry for the Ministry app. Reuses the shared auth forms from
// @rekindle/features; on success the AuthProvider updates and the app routes the
// member into their ministry space.
export default function AuthScreen({ onSuccess }: { onSuccess?: () => void }) {
  const [view, setView] = useState<View>('login');

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">ReKindle Ministry</CardTitle>
          <p className="text-sm text-muted-foreground">
            {view === 'login' && 'Sign in to your ministry'}
            {view === 'signup' && 'Create your account'}
            {view === 'reset' && 'Reset your password'}
          </p>
        </CardHeader>
        <CardContent>
          {view === 'login' && (
            <LoginForm
              onSwitchToSignup={() => setView('signup')}
              onSwitchToReset={() => setView('reset')}
              onSuccess={onSuccess}
            />
          )}
          {view === 'signup' && (
            <SignupForm onSwitchToLogin={() => setView('login')} onSuccess={onSuccess} />
          )}
          {view === 'reset' && (
            <PasswordResetForm onSwitchToLogin={() => setView('login')} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
