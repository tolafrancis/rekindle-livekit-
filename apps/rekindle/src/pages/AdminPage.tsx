import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppProvider } from '@/contexts/AppContext';
import { AdminDashboard } from '@/components/AdminDashboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Shield, AlertCircle, CheckCircle, Settings, Lock, Loader2, RefreshCw, Crown, UserCog } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Superadmin emails - these users have full control and can assign roles
const SUPERADMIN_EMAILS = [
  'tolaolabanjo@gmail.com',
  'tolafrancis4biz@gmail.com'
];

// Constants
const LOADING_TIMEOUT = 5000;

// Admin page - accessible by superadmins AND admin role users
const AdminPage: React.FC = () => {
  const navigate = useNavigate();

  const [oauthStatus, setOauthStatus] = useState<{
    google: boolean;
    facebook: boolean;
    checking: boolean;
  }>({ google: false, facebook: false, checking: true });
  
  const [forceShowContent, setForceShowContent] = useState(false);
  
  // Refs to prevent duplicate operations
  const isMounted = useRef(true);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const oauthCheckDone = useRef(false);
  
  // Safe auth hook usage with fallback
  let user = null;
  let profile = null;
  let loading = false;
  let refreshProfile = async () => {};
  
  try {
    const auth = useAuth();
    user = auth.user;
    profile = auth.profile;
    loading = auth.loading;
    refreshProfile = auth.refreshProfile;
  } catch (e) {
    // Auth context not available, continue with defaults
    console.warn('[AdminPage] Auth context not available');
  }

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Loading timeout
  useEffect(() => {
    if (loading && !forceShowContent) {
      loadingTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          console.warn('[AdminPage] Loading timeout, forcing content display');
          setForceShowContent(true);
        }
      }, LOADING_TIMEOUT);
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [loading, forceShowContent]);

  // Check OAuth providers (only once)
  useEffect(() => {
    if (!oauthCheckDone.current) {
      oauthCheckDone.current = true;
      checkOAuthProviders();
    }
  }, []);

  const checkOAuthProviders = useCallback(async () => {
    try {
      const providers = {
        google: false,
        facebook: false
      };
      if (isMounted.current) {
        setOauthStatus({ ...providers, checking: false });
      }
    } catch (error) {
      console.error('[AdminPage] Error checking OAuth providers:', error);
      if (isMounted.current) {
        setOauthStatus({ google: false, facebook: false, checking: false });
      }
    }
  }, []);

  // Check if user is a superadmin (owner - can assign roles)
  const isSuperAdmin = useCallback(() => {
    if (!user?.email) return false;
    return SUPERADMIN_EMAILS.includes(user.email.toLowerCase()) || 
           profile?.role === 'super_admin';
  }, [user?.email, profile?.role]);

  // Check if user has admin access (admin or super_admin)
  const hasAdminAccess = useCallback(() => {
    if (!user?.email) return false;
    // Superadmins always have access
    if (SUPERADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
    // Check role
    return profile?.role === 'admin' || profile?.role === 'super_admin';
  }, [user?.email, profile?.role]);

  const handleRefreshProfile = useCallback(async () => {
    try {
      await refreshProfile();
    } catch (error) {
      console.error('[AdminPage] Error refreshing profile:', error);
    }
  }, [refreshProfile]);

  // Show loading only briefly (with timeout fallback)
  if (loading && !forceShowContent) {
    return (
      <AppProvider>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
            <p className="text-gray-600 text-sm">Loading admin panel...</p>
          </div>
        </div>
      </AppProvider>
    );
  }

  // Check if user has admin access (superadmin OR admin role)
  if (!hasAdminAccess()) {
    return (
      <AppProvider>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardHeader className="text-center">
              <Lock className="h-12 w-12 mx-auto text-red-500 mb-4" />
              <CardTitle className="text-red-600">Access Denied</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-gray-600">
                You don't have permission to access the admin dashboard.
              </p>
              <p className="text-sm text-gray-500">
                Only administrators can access this area.
              </p>
              {user && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Logged in as: <span className="font-medium">{user.email}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Current role: <Badge variant="outline">{profile?.role || 'user'}</Badge>
                  </p>
                </div>
              )}
              <div className="flex gap-2 justify-center pt-2">
                <Link to="/">
                  <Button variant="outline">Go Home</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppProvider>
    );
  }

  return (
    <AppProvider>
      <ErrorBoundary>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white shadow-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link to="/">
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <h1 className="text-2xl font-serif font-bold text-purple-700">ReKindle Admin</h1>
              </div>
              <div className="flex items-center gap-4">
                {/* Refresh Profile Button */}
                <Button variant="ghost" size="sm" onClick={handleRefreshProfile}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                
                {isSuperAdmin() ? (
                  <Badge variant="default" className="bg-amber-600">
                    <Crown className="h-3 w-3 mr-1" />
                    Super Admin
                  </Badge>
                ) : (
                  <Badge variant="default" className="bg-purple-600">
                    <UserCog className="h-3 w-3 mr-1" />
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          </header>
          
          {/* OAuth Status Banner */}
          <div className="max-w-7xl mx-auto px-4 py-2">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="py-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">OAuth Provider Status</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      {oauthStatus.checking ? (
                        <div className="h-3 w-3 rounded-full bg-gray-300 animate-pulse" />
                      ) : oauthStatus.google ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="text-sm text-gray-700">Google</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {oauthStatus.checking ? (
                        <div className="h-3 w-3 rounded-full bg-gray-300 animate-pulse" />
                      ) : oauthStatus.facebook ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="text-sm text-gray-700">Facebook</span>
                    </div>
                    <a 
                      href="https://supabase.com/dashboard" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Configure in Supabase
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current User Info */}
          {user && (
            <div className="max-w-7xl mx-auto px-4 py-2">
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {isSuperAdmin() ? (
                        <Crown className="h-4 w-4 text-amber-600" />
                      ) : (
                        <UserCog className="h-4 w-4 text-purple-600" />
                      )}
                      <span className="text-sm font-medium text-purple-800">Logged in as: {user.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Role:</span>
                      <Badge className={isSuperAdmin() ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700"}>
                        {isSuperAdmin() ? 'Super Admin' : profile?.role || 'admin'}
                      </Badge>
                      {isSuperAdmin() && (
                        <span className="text-xs text-gray-500">(Can assign roles)</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          <div className="max-w-7xl mx-auto px-4 py-6">
            <ErrorBoundary>
              <AdminDashboard isSuperAdmin={isSuperAdmin()} />
            </ErrorBoundary>
          </div>
        </div>
      </ErrorBoundary>
    </AppProvider>
  );
};

export default AdminPage;
