import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Separator } from '@rekindle/ui/separator';
import { Checkbox } from '@rekindle/ui/checkbox';
import { AppleSignInButton, isAppleSignInAvailable } from './AppleSignInButton';
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';

/** Passed to onSuccess. needsEmailConfirmation is true when Supabase created
 *  the account but returned no session (email confirmation is switched on) —
 *  the visitor can't use the app until they click the link in their inbox. */
export interface SignupSuccessInfo {
  email: string;
  needsEmailConfirmation: boolean;
}

interface SignupFormProps {
  onSwitchToLogin: () => void;
  /** Existing callers pass `() => {}` and ignore the argument. */
  onSuccess: (info?: SignupSuccessInfo) => void;
  /** See LoginForm.tsx's matching prop for the full explanation — same
   *  bug, same fix, same 4-standalone/2-embedded caller split. */
  compact?: boolean;
}

// See the matching note in LoginForm.tsx: desktop (Electron) builds hide
// Google/Facebook sign-up for the same reason (unverified OAuth redirect-URI
// allow-listing for the local http://127.0.0.1:PORT origin). Never true on
// web or Capacitor.
const isElectronApp = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

const RESEND_COOLDOWN_SECONDS = 60;

interface ConfirmEmailNoticeProps {
  email: string;
  /** "Back to sign in" — omitted hides the button. */
  onBackToSignIn?: () => void;
  compact?: boolean;
}

/** "Confirm your email" screen shown after a sign-up that returned no session.
 *  Resend uses the standard supabase.auth.resend({ type: 'signup' }) client
 *  call — no auth config is touched. */
export const ConfirmEmailNotice: React.FC<ConfirmEmailNoticeProps> = ({ email, onBackToSignIn, compact = false }) => {
  const { t } = useLanguage();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const handleResend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) {
        setMessage({ kind: 'error', text: error.message });
      } else {
        setMessage({ kind: 'ok', text: t('auth', 'confirmEmailResent', 'We sent another confirmation email.') });
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message || t('auth', 'confirmEmailResendFailed', "Couldn't resend the email. Please try again.") });
    } finally {
      setResending(false);
    }
  };

  const card = (
    <div className={compact ? 'w-full space-y-5 text-center' : 'w-full max-w-md space-y-5 bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center'}>
      <div className="mx-auto w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
        <Mail className="h-7 w-7 text-purple-600" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {t('auth', 'confirmEmailTitle', 'Confirm your email')}
        </h1>
        <p className="text-sm text-gray-600">
          {t('auth', 'confirmEmailSentTo', 'We sent a confirmation link to')}
        </p>
        <p className="text-sm font-semibold text-gray-900 break-all">{email}</p>
        <p className="text-sm text-gray-500">
          {t('auth', 'confirmEmailInstructions', 'Open the link in that email to activate your account, then sign in. Check your spam folder if you can’t find it.')}
        </p>
      </div>
      {message && (
        <div
          role="status"
          className={message.kind === 'ok' ? 'bg-green-50 text-green-700 p-3 rounded-lg text-sm' : 'bg-red-50 text-red-600 p-3 rounded-lg text-sm'}
        >
          {message.text}
        </div>
      )}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={handleResend}
          disabled={resending || cooldown > 0}
        >
          {resending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('auth', 'confirmEmailResending', 'Sending...')}</>
          ) : cooldown > 0 ? (
            t('auth', 'confirmEmailResendIn', 'Resend email in {seconds}s').replace('{seconds}', String(cooldown))
          ) : (
            t('auth', 'confirmEmailResend', 'Resend email')
          )}
        </Button>
        {onBackToSignIn && (
          <Button type="button" className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white" onClick={onBackToSignIn}>
            {t('auth', 'confirmEmailBackToSignIn', "I've confirmed — sign in")}
          </Button>
        )}
      </div>
    </div>
  );

  if (compact) return card;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
      {card}
    </div>
  );
};

export const SignupForm: React.FC<SignupFormProps> = ({ onSwitchToLogin, onSuccess, compact = false }) => {
  const { signUp, signInWithGoogle, signInWithFacebook, signInWithApple } = useAuth();
  const { t } = useLanguage();
  const showSocialLogin = !isElectronApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | 'facebook' | null>(null);
  const [error, setError] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Set when sign-up succeeded without a session (email confirmation on).
  // Only visible while this form stays mounted — callers that swap screens on
  // auth state should render ConfirmEmailNotice themselves from onSuccess's info.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  // Google Play UGC policy: every sign-up path must accept the Terms and
  // Community Guidelines (zero tolerance for objectionable content/abuse).
  const requireTerms = (): boolean => {
    if (acceptedTerms) return true;
    setError('Please accept the Terms of Service and Community Guidelines to continue.');
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireTerms()) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    const result = await signUp(email, password, fullName);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // signUp() resolves {} both when a session was created and when Supabase
    // is waiting for the email link — read the client's session to tell them
    // apart (read-only; the auth flow itself is unchanged).
    const normalizedEmail = email.toLowerCase().trim();
    let hasSession = true;
    try {
      const { data } = await supabase.auth.getSession();
      hasSession = !!data.session;
    } catch {
      hasSession = true; // can't tell — fall back to the previous behaviour
    }
    setLoading(false);
    if (!hasSession) setConfirmEmail(normalizedEmail);
    onSuccess({ email: normalizedEmail, needsEmailConfirmation: !hasSession });
  };

  const handleGoogleSignIn = async () => {
    if (!requireTerms()) return;
    setSocialLoading('google');
    setError('');
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setSocialLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    if (!requireTerms()) return;
    setSocialLoading('apple');
    setError('');
    const result = await signInWithApple();
    if (result.error) {
      setError(result.error);
      setSocialLoading(null);
    }
  };

  const handleFacebookSignIn = async () => {
    if (!requireTerms()) return;
    setSocialLoading('facebook');
    setError('');
    const result = await signInWithFacebook();
    if (result.error) {
      setError(result.error);
      setSocialLoading(null);
    }
  };

  const card = (
        <div className={compact ? 'w-full space-y-5' : 'w-full max-w-md space-y-5 bg-white p-8 rounded-2xl shadow-sm border border-gray-100'}>
          {/* Logo header — see LoginForm.tsx's matching comment for why this
              is unconditional in compact mode instead of hidden md:flex. */}
          <div className={compact ? 'flex items-center gap-2.5 mb-2' : 'hidden md:flex items-center gap-2.5 mb-2'}>
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md">
              R
            </div>
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              Re<span className="text-purple-600">Kindle</span>
            </span>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Create your account</h1>
            <p className="text-sm text-gray-500 mt-1">Join your faith community</p>
          </div>

          <label htmlFor="acceptTerms" className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 cursor-pointer">
            <Checkbox
              id="acceptTerms"
              checked={acceptedTerms}
              onCheckedChange={(v) => {
                setAcceptedTerms(v === true);
                if (v === true) setError('');
              }}
              className="mt-0.5"
            />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-purple-600 hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="/terms#community-guidelines" target="_blank" rel="noreferrer" className="font-medium text-purple-600 hover:underline">Community Guidelines</a>.
              {' '}There is zero tolerance for objectionable content or abusive users.
            </span>
          </label>
          {error && !acceptedTerms && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}

          {showSocialLogin && (
            <>
              {/* Social Login Buttons */}
              <div className="space-y-3">
                {isAppleSignInAvailable() && (
                  <AppleSignInButton
                    label="Sign up with Apple"
                    loading={socialLoading === 'apple'}
                    disabled={!!socialLoading}
                    onClick={handleAppleSignIn}
                  />
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 text-sm font-medium border-gray-300"
                  onClick={handleGoogleSignIn}
                  disabled={!!socialLoading}
                >
                  {socialLoading === 'google' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Sign up with Google
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 text-sm font-medium bg-[#1877F2] text-white hover:bg-[#166FE5] hover:text-white border-[#1877F2]"
                  onClick={handleFacebookSignIn}
                  disabled={!!socialLoading}
                >
                  {socialLoading === 'facebook' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  )}
                  Sign up with Facebook
                </Button>
              </div>

              <div className="relative my-3">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-white px-3 text-xs text-gray-500">
                  or sign up with email
                </span>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && acceptedTerms && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            <div className="space-y-1">
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="fullName" 
                  placeholder="Your name" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                  className="pl-10 h-10" 
                  autoComplete="name"
                  required 
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="your@email.com" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  className="pl-10 h-10" 
                  autoComplete="email"
                  inputMode="email"
                  required 
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="password" 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Create password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="pl-10 pr-10 h-10" 
                  autoComplete="new-password"
                  minLength={6}
                  aria-describedby="passwordRule"
                  required 
                />
                {/* Controls both password fields so the visitor can check the
                    confirmation matches without retyping. */}
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? t('auth', 'hidePasswords', 'Hide passwords') : t('auth', 'showPasswords', 'Show passwords')}
                  aria-pressed={showPassword}
                  aria-controls="password confirmPassword"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p id="passwordRule" className="text-xs text-gray-500">
                {t('auth', 'passwordRule', 'At least 6 characters.')}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="confirmPassword" 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Confirm password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  className="pl-10 h-10" 
                  autoComplete="new-password"
                  required 
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white mt-2" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</> : 'Create Account'}
            </Button>
            <p className="text-center text-sm text-gray-600 pt-1">
              Already have an account?{' '}
              <button type="button" onClick={onSwitchToLogin} className="text-purple-600 hover:underline font-semibold">
                Sign in
              </button>
            </p>
          </form>
        </div>
  );

  if (confirmEmail) {
    return <ConfirmEmailNotice email={confirmEmail} onBackToSignIn={onSwitchToLogin} compact={compact} />;
  }

  if (compact) return card;

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-gray-50">
      {/* Mobile / Tablet Header (hidden on desktop) */}
      <div className="md:hidden bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm">
            R
          </div>
          <span className="text-xl font-bold tracking-tight">ReKindle</span>
        </div>
        <p className="text-xs text-white/80">Join your faith community</p>
      </div>

      {/* Left Panel: Form Container */}
      <div className="w-full md:w-1/2 flex flex-col justify-center items-center p-6 sm:p-8 md:p-12 min-h-[calc(100vh-100px)] md:min-h-screen">
        {card}
      </div>

      {/* Right Panel: Background Image + Overlay (Desktop only) */}
      <div
        className="hidden md:flex md:w-1/2 relative bg-cover bg-center flex-col justify-end p-12 text-white overflow-hidden"
        style={{ backgroundImage: "url('/auth-bg.jpg')" }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(30,15,60,0.92) 0%, rgba(30,15,60,0.55) 60%, rgba(30,15,60,0.15) 100%)' }}
        />
        <div className="relative z-10 max-w-lg">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
            Grow in faith, stay connected
          </h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Devotionals, live services, prayer and community — all in one place.
          </p>
        </div>
      </div>
    </div>
  );
};
