import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@rekindle/ui/button';
import { Loader2 } from 'lucide-react';

// Sign in with Apple only exists in the iOS app (see nativeAppleSignIn in
// AuthContext). Apple's guidelines want it at least as prominent as the other
// social buttons, so the forms render it first.
export const isAppleSignInAvailable = (): boolean => Capacitor.getPlatform() === 'ios';

interface AppleSignInButtonProps {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({ label, loading, disabled, onClick }) => (
  <Button
    type="button"
    className="w-full h-11 text-sm font-medium bg-black text-white hover:bg-gray-900 hover:text-white"
    onClick={onClick}
    disabled={disabled}
  >
    {loading ? (
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    ) : (
      <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M16.37 12.62c-.02-2.4 1.96-3.56 2.05-3.62-1.12-1.63-2.86-1.86-3.47-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.61.02-3.1.94-3.93 2.38-1.68 2.91-.43 7.21 1.2 9.57.8 1.15 1.75 2.45 2.99 2.4 1.2-.05 1.66-.78 3.11-.78 1.45 0 1.86.78 3.13.75 1.29-.02 2.11-1.17 2.9-2.33.92-1.33 1.29-2.63 1.31-2.7-.03-.01-2.51-.96-2.51-3.83zM14 5.57c.66-.8 1.11-1.92.99-3.03-.95.04-2.11.64-2.79 1.43-.61.7-1.15 1.84-1 2.93 1.06.08 2.14-.54 2.8-1.33z" />
      </svg>
    )}
    {label}
  </Button>
);
