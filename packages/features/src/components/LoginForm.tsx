import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Separator } from '@rekindle/ui/separator';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

interface LoginFormProps {
  onSwitchToSignup: () => void;
  onSwitchToReset?: () => void;
  onSuccess: () => void;
}

// Desktop (Electron) builds hide Google/Facebook sign-in: the web OAuth
// branch in AuthContext redirects to `window.location.origin`, and whether
// our local http://127.0.0.1:PORT origin is an allowed redirect URI in
// Supabase/Google/Facebook's OAuth app config is unverified — safer to hide
// the buttons than ship a broken flow. Email/password has no such
// dependency and stays fully available. Never true on web or Capacitor.
const isElectronApp = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignup, onSwitchToReset, onSuccess }) => {
  const { signIn, signInWithGoogle, signInWithFacebook } = useAuth();
  const showSocialLogin = !isElectronApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
    } else {
      onSuccess();
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setSocialLoading('google');
    setError('');
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setSocialLoading(null);
    }
  };

  const handleFacebookSignIn = async () => {
    setSocialLoading('facebook');
    setError('');
    const result = await signInWithFacebook();
    if (result.error) {
      setError(result.error);
      setSocialLoading(null);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white">
      {/* Mobile / Tablet Header (hidden on desktop) */}
      <div className="md:hidden bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm">
            R
          </div>
          <span className="text-xl font-bold tracking-tight">ReKindle</span>
        </div>
        <p className="text-xs text-white/80">Grow in faith, stay connected</p>
      </div>

      {/* Left Panel: Form Container */}
      <div className="w-full md:w-1/2 flex flex-col justify-center items-center p-6 sm:p-8 md:p-12 min-h-[calc(100vh-100px)] md:min-h-screen">
        <div className="w-full max-w-md space-y-6">
          {/* Logo Header (Desktop only) */}
          <div className="hidden md:flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md">
              R
            </div>
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              Re<span className="text-purple-600">Kindle</span>
            </span>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to continue your spiritual journey</p>
          </div>

          {showSocialLogin && (
            <>
              {/* Social Login Buttons */}
              <div className="space-y-3">
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
                  Continue with Google
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
                  Continue with Facebook
                </Button>
              </div>

              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-white px-3 text-xs text-gray-500">
                  or sign in with email
                </span>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="your@email.com" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  className="pl-10 h-11" 
                  required 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
                {onSwitchToReset && (
                  <button 
                    type="button" 
                    onClick={onSwitchToReset} 
                    className="text-xs text-purple-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="password" 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Enter password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="pl-10 pr-10 h-11" 
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
            </Button>
            <p className="text-center text-sm text-gray-600 pt-2">
              Don't have an account?{' '}
              <button type="button" onClick={onSwitchToSignup} className="text-purple-600 hover:underline font-semibold">
                Sign up
              </button>
            </p>
          </form>
        </div>
      </div>

      {/* Right Panel: Background Image + Overlay (Desktop only) */}
      <div 
        className="hidden md:flex md:w-1/2 relative bg-cover bg-center flex-col justify-end p-12 text-white"
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
