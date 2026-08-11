import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';

interface PasswordResetFormProps {
  onSwitchToLogin: () => void;
}

// Helper to check URL for recovery parameters
const checkUrlForRecovery = (): boolean => {
  const hash = window.location.hash;
  const search = window.location.search;
  
  // Parse hash parameters (Supabase puts tokens in hash)
  const hashParams = new URLSearchParams(hash.replace('#', '').replace('/', ''));
  const searchParams = new URLSearchParams(search);
  
  // Check all possible recovery indicators
  const hasAccessToken = hash.includes('access_token');
  const isRecoveryType = 
    hashParams.get('type') === 'recovery' ||
    searchParams.get('type') === 'recovery' ||
    hash.includes('type=recovery') ||
    search.includes('type=recovery');
  
  // If we have an access token AND recovery type, or just recovery type
  return isRecoveryType || (hasAccessToken && hash.includes('recovery'));
};

export const PasswordResetForm: React.FC<PasswordResetFormProps> = ({ onSwitchToLogin }) => {
  const { resetPassword, updatePassword, user, isRecoveryMode } = useAuth();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<'request' | 'update'>('request');
  
  // Prevent double submission
  const isSubmittingRef = React.useRef(false);

  // Determine mode based on recovery state and URL
  useEffect(() => {
    const hasRecoveryToken = checkUrlForRecovery();
    
    console.log('PasswordResetForm: Checking mode', { 
      hasRecoveryToken, 
      isRecoveryMode, 
      userEmail: user?.email,
      hasHash: Boolean(window.location.hash) 
    });
    
    // If we have a recovery token or isRecoveryMode is true, show update form
    if (hasRecoveryToken || isRecoveryMode) {
      console.log('PasswordResetForm: Setting mode to update');
      setMode('update');
      // Pre-fill email if user is available
      if (user?.email) {
        setEmail(user.email);
      }
    }
  }, [isRecoveryMode, user]);

  // Also listen for hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hasRecoveryToken = checkUrlForRecovery();
      if (hasRecoveryToken) {
        setMode('update');
        if (user?.email) {
          setEmail(user.email);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmittingRef.current || loading) {
      return;
    }
    
    isSubmittingRef.current = true;
    setLoading(true);
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      setLoading(false);
      isSubmittingRef.current = false;
      return;
    }

    try {
      const result = await resetPassword(email);
      
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
      // Delay resetting the ref to prevent rapid re-submissions
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 2000);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmittingRef.current || loading) {
      console.log('PasswordResetForm: Preventing double submission');
      return;
    }
    
    isSubmittingRef.current = true;
    setLoading(true);
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      isSubmittingRef.current = false;
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      isSubmittingRef.current = false;
      return;
    }

    try {
      const result = await updatePassword(newPassword);
      
      if (result.error) {
        setError(result.error);
        isSubmittingRef.current = false;
      } else {
        setSuccess(true);
        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          onSwitchToLogin();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
      isSubmittingRef.current = false;
    } finally {
      setLoading(false);
    }
  };


  // Success state for request mode
  if (success && mode === 'request') {
    return (
      <Card className="w-full max-w-md mx-auto shadow-xl border-0 bg-white/95 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-serif">Check Your Email</CardTitle>
          <CardDescription className="text-base">
            We've sent a password reset link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 text-center mb-6">
            Click the link in the email to reset your password. If you don't see it, check your spam folder.
          </p>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={onSwitchToLogin}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Success state for update mode
  if (success && mode === 'update') {
    return (
      <Card className="w-full max-w-md mx-auto shadow-xl border-0 bg-white/95 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-serif">Password Updated!</CardTitle>
          <CardDescription className="text-base">
            Your password has been successfully changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 text-center mb-6">
            Redirecting you to login...
          </p>
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto shadow-xl border-0 bg-white/95 backdrop-blur">
      <CardHeader className="text-center pb-2">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full mx-auto mb-4 flex items-center justify-center">
          <Lock className="h-8 w-8 text-white" />
        </div>
        <CardTitle className="text-2xl font-serif">
          {mode === 'request' ? 'Reset Password' : 'Set New Password'}
        </CardTitle>
        <CardDescription>
          {mode === 'request' 
            ? 'Enter your email to receive a reset link'
            : 'Choose a new password for your account'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mode === 'request' ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="your@email.com" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  className="pl-10" 
                  required 
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>

            <Button 
              type="button"
              variant="ghost" 
              className="w-full"
              onClick={onSwitchToLogin}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
          </form>
        ) : (
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            
            <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm">
              You're resetting your password{user?.email ? ` for ${user.email}` : ''}.
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="newPassword" 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Enter new password" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  className="pl-10 pr-10" 
                  required 
                  minLength={6}
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  id="confirmPassword" 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Confirm new password" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  className="pl-10" 
                  required 
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>

            <Button 
              type="button"
              variant="ghost" 
              className="w-full"
              onClick={onSwitchToLogin}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel and Return to Login
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};
