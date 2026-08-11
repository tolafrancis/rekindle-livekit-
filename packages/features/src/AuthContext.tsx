// src/contexts/AuthContext.tsx
// FINAL POLISHED VERSION - Seamless Signup

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { supabase, verifySession, verifyAdminAccess, clearSupabaseAuth } from '@rekindle/supabase';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';

function getAuthRedirectScheme(): string {
  const appType = import.meta.env.VITE_APP_TYPE;
  if (appType === 'ministry') return 'rekindleministry';
  return 'rekindle'; // default to ReKindle's scheme
}

async function nativeOAuthSignIn(provider: 'google' | 'facebook') {
  const scheme = getAuthRedirectScheme();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${scheme}://auth-callback`,
      skipBrowserRedirect: true,
    },
  });
  if (error) return { error: error.message };
  if (data?.url) {
    await Browser.open({ url: data.url });
    return {};
  }
  return { error: 'Failed to get OAuth URL' };
}

async function nativeGoogleSignIn(): Promise<{ error?: string }> {
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle({
      mode: 'popup',
    });
    const idToken = result.credential?.idToken;
    if (!idToken) return { error: 'No ID token received from Google' };
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { error: error.message };
    return {};
  } catch (err: any) {
    return { error: err.message || 'Google Sign-In failed' };
  }
}

// ============================================
// TYPES
// ============================================

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  language_preference: string;
  spiritual_level: string;
  consent_devotionals: boolean;
  consent_affirmations: boolean;
  consent_reminders: boolean;
  consent_marketing: boolean;
  onboarding_completed: boolean;
  prayer_streak: number;
  total_prayers: number;
  xp_points: number;
  disciples_count: number;
  role?: string;
  subscription_tier?: string;
  partner_expires_at?: string | null;
  partner_tier?: 'individual' | 'ministry' | null;
  partner_total_donated?: number;
  partner_donation_count?: number;
  subscription_ends_at?: string;
  is_banned?: boolean;
}

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  isAdmin: boolean;
  isPartner: boolean;
  isMinistryPartner: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInWithFacebook: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error?: string; success?: boolean }>;
  completeOnboarding: (data: any) => Promise<void>;
  syncAccountsByEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (email: string) => Promise<{ error?: string; success?: boolean }>;
  updatePassword: (newPassword: string) => Promise<{ error?: string; success?: boolean }>;
  clearAuthState: () => void;
  refreshProfile: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  isRecoveryMode: boolean;
  setRecoveryMode: (value: boolean) => void;
}

// ============================================
// CONSTANTS
// ============================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_CHECK_TIMEOUT = 10000;
const SESSION_REFRESH_INTERVAL = 4 * 60 * 1000;
const PROFILE_FETCH_TIMEOUT = 5000;

// ============================================
// HELPER FUNCTIONS
// ============================================

const safeJSONParse = (str: string | null): any => {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};

const isTokenExpired = (tokenData: any): boolean => {
  if (!tokenData || !tokenData.exp) return true;
  return Date.now() > tokenData.exp;
};

const clearAuthStorage = () => {
  clearSupabaseAuth();
};

const checkUrlForRecovery = (): boolean => {
  const hash = window.location.hash;
  const search = window.location.search;
  
  const hashParams = new URLSearchParams(hash.replace('#', ''));
  const searchParams = new URLSearchParams(search);
  
  const isRecovery = 
    hashParams.get('type') === 'recovery' ||
    searchParams.get('type') === 'recovery' ||
    hash.includes('type=recovery') ||
    search.includes('type=recovery') ||
    (hash.includes('access_token') && hash.includes('recovery'));
  
  return isRecovery;
};

const extractSessionFromUrl = async (): Promise<{ session: any; isRecovery: boolean }> => {
  const hash = window.location.hash;
  
  if (!hash.includes('access_token')) {
    return { session: null, isRecovery: false };
  }

  const hashParams = new URLSearchParams(hash.replace('#', ''));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  const type = hashParams.get('type');

  if (accessToken && refreshToken) {
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!error && data.session) {
        window.history.replaceState({}, document.title, window.location.pathname);
        return { session: data.session, isRecovery: type === 'recovery' };
      }
    } catch (e) {
      console.error('[AUTH] Failed to set session from URL:', e);
    }
  }

  return { session: null, isRecovery: false };
};

// ============================================
// HOOK
// ============================================

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// ============================================
// PROVIDER
// ============================================

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const passwordUpdateInProgressRef = useRef(false);
  const sessionRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const profileFetchInProgressRef = useRef(false);
  const authStateChangeHandledRef = useRef(false);

  const clearAuthState = useCallback(() => {
    console.log('[AUTH] Clearing auth state');
    clearAuthStorage();
    setUser(null);
    setProfile(null);
    setLoading(false);
    setInitialized(true);
    setIsRecoveryMode(false);
    setIsAdmin(false);
  }, []);

  const setRecoveryMode = useCallback((value: boolean) => {
    setIsRecoveryMode(value);
  }, []);

  // ============================================
  // PROFILE MANAGEMENT
  // ============================================

  const fetchProfileWithTimeout = useCallback(async (userId: string, email?: string): Promise<UserProfile | null> => {
    if (profileFetchInProgressRef.current) {
      return null;
    }
    
    profileFetchInProgressRef.current = true;
    
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (data && !error) {
        if (mountedRef.current) {
          setProfile(data);
          const adminRoles = ['admin', 'super_admin', 'moderator'];
          setIsAdmin(adminRoles.includes(data.role || ''));
        }
        profileFetchInProgressRef.current = false;
        return data;
      }

      if (email) {
        const { data: emailData, error: emailError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('email', email.toLowerCase())
          .maybeSingle();

        if (emailData && !emailError) {
          await supabase
            .from('user_profiles')
            .update({ user_id: userId })
            .eq('id', emailData.id);
          
          const linkedProfile = { ...emailData, user_id: userId };
          if (mountedRef.current) {
            setProfile(linkedProfile);
            const adminRoles = ['admin', 'super_admin', 'moderator'];
            setIsAdmin(adminRoles.includes(linkedProfile.role || ''));
          }
          profileFetchInProgressRef.current = false;
          return linkedProfile;
        }
      }

      profileFetchInProgressRef.current = false;
      return null;
    } catch (error: any) {
      profileFetchInProgressRef.current = false;
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfileWithTimeout(user.id, user.email);
    }
  }, [user, fetchProfileWithTimeout]);

  // ============================================
  // CREATE PROFILE - ROBUST VERSION
  // ============================================

  const createProfileForUser = async (authUser: any): Promise<{ profile: UserProfile | null; error?: string }> => {
    try {
      // Check if profile exists
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (existing) {
        if (mountedRef.current) {
          setProfile(existing);
          const adminRoles = ['admin', 'super_admin', 'moderator'];
          setIsAdmin(adminRoles.includes(existing.role || ''));
        }
        return { profile: existing };
      }

      // Check by email
      if (authUser.email) {
        const { data: byEmail } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('email', authUser.email.toLowerCase())
          .maybeSingle();

        if (byEmail) {
          const { data: updated } = await supabase
            .from('user_profiles')
            .update({ user_id: authUser.id })
            .eq('id', byEmail.id)
            .select()
            .maybeSingle();

          if (updated && mountedRef.current) {
            setProfile(updated);
            const adminRoles = ['admin', 'super_admin', 'moderator'];
            setIsAdmin(adminRoles.includes(updated.role || ''));
            return { profile: updated };
          }
        }
      }

      // Create new profile
      const superAdminEmails = ['tolaolabanjo@gmail.com', 'tolafrancis4biz@gmail.com'];
      const isSuperAdmin = superAdminEmails.includes((authUser.email || '').toLowerCase());
      
      const fullName = authUser.user_metadata?.full_name || 
                       authUser.user_metadata?.name || 
                       authUser.email?.split('@')[0] || 
                       'User';

      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: authUser.id,
          email: (authUser.email || '').toLowerCase(),
          full_name: fullName,
          avatar_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || '',
          language_preference: 'en',
          spiritual_level: 'beginner',
          consent_devotionals: true,
          consent_affirmations: true,
          consent_reminders: true,
          consent_marketing: false,
          onboarding_completed: false,
          prayer_streak: 0,
          total_prayers: 0,
          xp_points: 0,
          disciples_count: 0,
          role: isSuperAdmin ? 'super_admin' : 'user'
        })
        .select()
        .single();

      if (insertError) {
        // If duplicate, fetch it
        if (insertError.code === '23505') {
          const { data: duplicate } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', authUser.id)
            .maybeSingle();
            
          if (duplicate && mountedRef.current) {
            setProfile(duplicate);
            const adminRoles = ['admin', 'super_admin', 'moderator'];
            setIsAdmin(adminRoles.includes(duplicate.role || ''));
            return { profile: duplicate };
          }
        }
        
        // Profile creation failed, but don't block signup
        console.error('[AUTH] Profile creation failed:', insertError);
        return { profile: null, error: undefined }; // Return no error to allow signup to continue
      }

      if (newProfile && mountedRef.current) {
        setProfile(newProfile);
        setIsAdmin(isSuperAdmin);
        return { profile: newProfile };
      }

      return { profile: null, error: undefined };

    } catch (error: any) {
      console.error('[AUTH] Exception in createProfileForUser:', error);
      return { profile: null, error: undefined }; // Don't block signup
    }
  };

  // ============================================
  // SESSION REFRESH
  // ============================================

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        return false;
      }

      if (mountedRef.current) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
        });
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  // ============================================
  // INITIALIZE AUTH
  // ============================================

  useEffect(() => {
    mountedRef.current = true;

    const initializeAuth = async () => {
      if (initializingRef.current) {
        return;
      }
      initializingRef.current = true;

      const inRecoveryMode = checkUrlForRecovery();
      if (inRecoveryMode && mountedRef.current) {
        setIsRecoveryMode(true);
      }

      const maxTimeout = setTimeout(() => {
        if (mountedRef.current && loading) {
          setLoading(false);
          setInitialized(true);
          initializingRef.current = false;
        }
      }, AUTH_CHECK_TIMEOUT);

      try {
        const storedToken = safeJSONParse(localStorage.getItem('kindled_token'));
        if (storedToken && isTokenExpired(storedToken)) {
          clearAuthStorage();
        }

        const { session: urlSession, isRecovery } = await extractSessionFromUrl();
        
        if (urlSession) {
          const userData = { id: urlSession.user.id, email: urlSession.user.email || '' };
          
          if (mountedRef.current) {
            setUser(userData);
            localStorage.setItem('kindled_user', JSON.stringify(userData));
            
            if (isRecovery) {
              setIsRecoveryMode(true);
              setLoading(false);
              setInitialized(true);
              clearTimeout(maxTimeout);
              initializingRef.current = false;
              return;
            }
          }

          await fetchProfileWithTimeout(urlSession.user.id, urlSession.user.email || '');

          if (mountedRef.current) {
            setLoading(false);
            setInitialized(true);
          }
          clearTimeout(maxTimeout);
          initializingRef.current = false;
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const userData = { id: session.user.id, email: session.user.email || '' };
          
          if (mountedRef.current) {
            setUser(userData);
            localStorage.setItem('kindled_user', JSON.stringify(userData));
          }

          if (!inRecoveryMode) {
            await fetchProfileWithTimeout(session.user.id, session.user.email || '');
          }
        } else {
          const storedUser = safeJSONParse(localStorage.getItem('kindled_user'));
          const storedTokenData = safeJSONParse(localStorage.getItem('kindled_token'));

          if (storedUser && storedTokenData && !isTokenExpired(storedTokenData)) {
            if (mountedRef.current) {
              setUser(storedUser);
            }
            await fetchProfileWithTimeout(storedUser.id, storedUser.email);
          } else if (storedUser || storedTokenData) {
            clearAuthStorage();
          }
        }

        if (mountedRef.current) {
          setLoading(false);
          setInitialized(true);
        }
        clearTimeout(maxTimeout);

      } catch (error) {
        clearAuthStorage();
        if (mountedRef.current) {
          setLoading(false);
          setInitialized(true);
        }
      }

      initializingRef.current = false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (authStateChangeHandledRef.current) return;
      
      authStateChangeHandledRef.current = true;
      setTimeout(() => { authStateChangeHandledRef.current = false; }, 500);

      if (event === 'PASSWORD_RECOVERY' && mountedRef.current) {
        setIsRecoveryMode(true);
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email || '' });
        }
        setLoading(false);
        setInitialized(true);
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        const isRecovery = checkUrlForRecovery();
        if (isRecovery && mountedRef.current) {
          setIsRecoveryMode(true);
          setUser({ id: session.user.id, email: session.user.email || '' });
          setLoading(false);
          setInitialized(true);
          return;
        }

        const userData = {
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || ''
        };
        localStorage.setItem('kindled_user', JSON.stringify(userData));
        
        if (mountedRef.current) {
          setUser(userData);
        }
        
        setTimeout(async () => {
          if (mountedRef.current) {
            await fetchProfileWithTimeout(session.user.id, session.user.email || '');
          }
        }, 100);
      }

      if (event === 'SIGNED_OUT' && mountedRef.current) {
        clearAuthStorage();
        setUser(null);
        setProfile(null);
        setIsRecoveryMode(false);
        setIsAdmin(false);
      }

      if (event === 'USER_UPDATED' && mountedRef.current && !passwordUpdateInProgressRef.current) {
        setIsRecoveryMode(false);
      }
    });

    initializeAuth();

    return () => {
      mountedRef.current = false;
      subscription?.unsubscribe();
      if (sessionRefreshIntervalRef.current) {
        clearInterval(sessionRefreshIntervalRef.current);
      }
    };
  }, [fetchProfileWithTimeout, refreshSession]);

  useEffect(() => {
    if (user && !isRecoveryMode) {
      if (sessionRefreshIntervalRef.current) {
        clearInterval(sessionRefreshIntervalRef.current);
      }
      sessionRefreshIntervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          refreshSession();
        }
      }, SESSION_REFRESH_INTERVAL);
    }

    return () => {
      if (sessionRefreshIntervalRef.current) {
        clearInterval(sessionRefreshIntervalRef.current);
      }
    };
  }, [user, isRecoveryMode, refreshSession]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.includes('auth-callback')) return;

      try {
        await Browser.close(); // dismiss the in-app browser tab if still open
      } catch {}

      try {
        // Safe parsing of custom scheme URL (e.g. rekindle://auth-callback?code=...)
        const parsedUrl = url.startsWith('http') ? url : url.replace(/^[a-z\-]+:\/\//i, 'https://');
        const urlObj = new URL(parsedUrl);
        const code = urlObj.searchParams.get('code');
        if (code) {
          console.log('[AUTH] Exchanging auth code for session natively');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[AUTH] Exchange code for session failed:', error.message);
          }
        }
      } catch (err) {
        console.error('[AUTH] Failed to process appUrlOpen redirect:', err);
      }
    });
    return () => { sub.then(s => s.remove()); };
  }, []);

  const syncAccountsByEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return { success: false, message: 'No authenticated user found' };

      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (existingProfile) {
        return { success: true, message: 'Profile already linked to this account' };
      }

      const { data: emailProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (emailProfile) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ user_id: authUser.id })
          .eq('id', emailProfile.id);

        if (updateError) {
          return { success: false, message: 'Failed to link accounts: ' + updateError.message };
        }

        await fetchProfileWithTimeout(authUser.id, email);
        return { success: true, message: 'Accounts successfully linked!' };
      }

      return { success: false, message: 'No existing profile found with this email' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Unknown error occurred' };
    }
  };

  // ============================================
  // SIGN UP - SEAMLESS VERSION
  // ============================================

  const signUp = async (email: string, password: string, fullName: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          return { error: 'An account with this email already exists. Please sign in instead.' };
        }
        return { error: authError.message };
      }

      if (authData.user) {
        const userData = { id: authData.user.id, email: normalizedEmail };
        localStorage.setItem('kindled_user', JSON.stringify(userData));
        setUser(userData);
        
        // Try to create profile, but don't fail signup if it doesn't work
        try {
          await createProfileForUser(authData.user);
        } catch (profileError) {
          console.warn('[AUTH] Profile creation failed, but signup succeeded:', profileError);
          // Continue anyway - user is authenticated
        }
        
        // Give profile a moment to be created
        setTimeout(async () => {
          if (mountedRef.current) {
            await fetchProfileWithTimeout(authData.user.id, normalizedEmail);
          }
        }, 500);
      }

      return {};
    } catch (error: any) {
      console.error('[AUTH] Signup error:', error);
      return { error: error.message || 'Sign up failed. Please try again.' };
    }
  };

  // ============================================
  // SIGN IN
  // ============================================

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (!authError && authData.user) {
        const userData = { id: authData.user.id, email: normalizedEmail };
        localStorage.setItem('kindled_user', JSON.stringify(userData));
        setUser(userData);
        
        await fetchProfileWithTimeout(authData.user.id, normalizedEmail);
        return {};
      }

      if (authError?.message?.includes('Invalid login credentials')) {
        const { data: profileByEmail } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (profileByEmail) {
          return { error: 'Invalid password. Please try again or reset your password.' };
        }
        return { error: 'User not found. Please check your email or sign up for a new account.' };
      }

      return { error: authError?.message || 'Sign in failed' };
    } catch (error: any) {
      return { error: error.message || 'Sign in failed' };
    }
  };

  const signInWithGoogle = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        return await nativeGoogleSignIn();
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      return error ? { error: error.message } : {};
    } catch (err: any) {
      return { error: err.message || 'Google sign in failed' };
    }
  };

  const signInWithFacebook = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        return await nativeOAuthSignIn('facebook');
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { redirectTo: window.location.origin }
      });
      if (error) return { error: error.message };
      return {};
    } catch (error: any) {
      return { error: error.message || 'Facebook sign in failed' };
    }
  };

  const signOut = useCallback(async () => {
    try {
      setUser(null);
      setProfile(null);
      setIsRecoveryMode(false);
      setIsAdmin(false);
      clearAuthStorage();
      
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.warn('[AUTH] Sign out error (ignored):', signOutError);
      }
    } catch (error) {
      setUser(null);
      setProfile(null);
      setIsRecoveryMode(false);
      setIsAdmin(false);
      clearAuthStorage();
    }
  }, []);

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/#type=recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: redirectUrl
      });
      if (error) return { error: error.message };
      return { success: true };
    } catch (error: any) {
      return { error: error.message || 'Password reset failed' };
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (passwordUpdateInProgressRef.current) {
      return { error: 'Password update already in progress' };
    }

    passwordUpdateInProgressRef.current = true;

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) {
        passwordUpdateInProgressRef.current = false;
        return { error: error.message };
      }
      
      setIsRecoveryMode(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      
      setTimeout(() => {
        passwordUpdateInProgressRef.current = false;
      }, 2000);
      
      return { success: true };
    } catch (error: any) {
      passwordUpdateInProgressRef.current = false;
      return { error: error.message || 'Password update failed' };
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>): Promise<{ error?: string; success?: boolean }> => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) {
        const { error: emailError } = await supabase
          .from('user_profiles')
          .update(updates)
          .eq('email', user.email);

        if (emailError) {
          return { error: emailError.message };
        }
      }

      await fetchProfileWithTimeout(user.id, user.email);
      return { success: true };
    } catch (error: any) {
      return { error: error.message || 'Profile update failed' };
    }
  };

  const completeOnboarding = async (data: any) => {
    await updateProfile({ ...data, onboarding_completed: true });
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      initialized,
      isAdmin,
      isPartner: !!(
        profile?.partner_expires_at &&
        new Date(profile.partner_expires_at) > new Date()
      ) || isAdmin,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithFacebook,
      signOut,
      updateProfile,
      completeOnboarding,
      syncAccountsByEmail,
      resetPassword,
      updatePassword,
      clearAuthState,
      refreshProfile,
      refreshSession,
      isRecoveryMode,
      setRecoveryMode
    }}>
      {children}
    </AuthContext.Provider>
  );
};