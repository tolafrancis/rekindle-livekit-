// src/lib/supabase.ts
// Enhanced Supabase client with environment verification and error handling
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Direct connection to user's Supabase project
const SUPABASE_URL = 'https://vpnpembyqbbaaiynfvli.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8';

// ============================================
// 1. ENVIRONMENT & CLIENT INITIALIZATION
// ============================================

// Hard-verify environment at runtime
const verifyEnvironment = (): { url: string; key: string } => {
  const url = SUPABASE_URL?.trim();
  const key = SUPABASE_ANON_KEY?.trim();

  if (!url || !url.includes('supabase.co')) {
    console.error('[SUPABASE FATAL] Invalid or missing SUPABASE_URL');
    throw new Error('Supabase URL is not configured. Application cannot start.');
  }

  if (!key || key.length < 100) {
    console.error('[SUPABASE FATAL] Invalid or missing SUPABASE_ANON_KEY');
    throw new Error('Supabase Anon Key is not configured. Application cannot start.');
  }

  // Extract project ref for consistency checking
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    console.error('[SUPABASE FATAL] Cannot extract project reference from URL');
    throw new Error('Invalid Supabase URL format.');
  }

  // Store project ref for consistency checks
  if (typeof window !== 'undefined') {
    const storedRef = localStorage.getItem('supabase_project_ref');
    if (storedRef && storedRef !== projectRef) {
      console.warn('[SUPABASE WARNING] Project reference mismatch detected!');
      console.warn(`Expected: ${storedRef}, Got: ${projectRef}`);
      // Clear potentially stale data from different project
      clearSupabaseAuth();
    }
    localStorage.setItem('supabase_project_ref', projectRef);
  }

  return { url, key };
};

// Verify environment immediately
const { url: verifiedUrl, key: verifiedKey } = verifyEnvironment();

// ============================================
// 2. CREATE SUPABASE CLIENT
// ============================================

export const supabase: SupabaseClient = createClient(verifiedUrl, verifiedKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    flowType: 'pkce',
    // Lock session to prevent ghost states
    storageKey: 'kindled-auth-token',
  },
  global: {
    headers: {
      'x-client-info': 'kindled-app',
    },
  },
  // Add realtime config
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Export the URL and key for edge functions or other uses
export const supabaseUrl = verifiedUrl;
export const supabaseAnonKey = verifiedKey;

// ============================================
// 3. AUTH HELPER FUNCTIONS
// ============================================

// Helper to clear all Supabase auth data
export const clearSupabaseAuth = () => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('kindled'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Failed to clear Supabase auth:', e);
  }
};

// ============================================
// 4. SESSION VERIFICATION UTILITIES
// ============================================

// Verify session is valid and synchronized
export const verifySession = async (): Promise<{ valid: boolean; user: any | null; error?: string }> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[SESSION] Verification error:', error.message);
      return { valid: false, user: null, error: error.message };
    }

    if (!session) {
      return { valid: false, user: null };
    }

    // Check if token is expired
    const expiresAt = session.expires_at;
    if (expiresAt && Date.now() / 1000 > expiresAt) {
      console.warn('[SESSION] Token expired, attempting refresh');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshData.session) {
        clearSupabaseAuth();
        return { valid: false, user: null, error: 'Session expired and refresh failed' };
      }
      
      return { valid: true, user: refreshData.session.user };
    }

    return { valid: true, user: session.user };
  } catch (e: any) {
    console.error('[SESSION] Verification exception:', e);
    return { valid: false, user: null, error: e.message };
  }
};

// ============================================
// 5. MUTATION SAFETY WRAPPER
// ============================================

export interface MutationResult<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface MutationOptions {
  retries?: number;
  retryDelay?: number;
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  requireAuth?: boolean;
}

// Safe mutation wrapper that prevents silent failures
export const safeMutation = async <T>(
  mutationFn: () => Promise<{ data: T | null; error: any }>,
  options: MutationOptions = {}
): Promise<MutationResult<T>> => {
  const { retries = 2, retryDelay = 1000, onSuccess, onError, requireAuth = true } = options;

  // Verify auth if required
  if (requireAuth) {
    const { valid, error: authError } = await verifySession();
    if (!valid) {
      const errorMsg = authError || 'Authentication required';
      onError?.(errorMsg);
      return { data: null, error: errorMsg, success: false };
    }
  }

  let lastError: string = 'Unknown error';
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await mutationFn();

      if (error) {
        lastError = error.message || JSON.stringify(error);
        console.error(`[MUTATION] Attempt ${attempt + 1} failed:`, lastError);
        
        // Check for RLS errors
        if (lastError.includes('row-level security') || lastError.includes('RLS')) {
          console.error('[MUTATION] RLS policy blocking operation');
          onError?.('Permission denied. Please check your access rights.');
          return { data: null, error: 'Permission denied', success: false };
        }

        // Check for schema errors
        if (lastError.includes('column') && lastError.includes('does not exist')) {
          console.error('[MUTATION] Schema mismatch detected');
          onError?.('Database schema error. Please refresh the page.');
          return { data: null, error: 'Schema mismatch', success: false };
        }

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }
      } else {
        onSuccess?.(data);
        return { data, error: null, success: true };
      }
    } catch (e: any) {
      lastError = e.message || 'Network error';
      console.error(`[MUTATION] Exception on attempt ${attempt + 1}:`, lastError);
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }
    }
  }

  onError?.(lastError);
  return { data: null, error: lastError, success: false };
};

// ============================================
// 6. ADMIN ACCESS VERIFICATION
// ============================================

export const verifyAdminAccess = async (userId: string): Promise<{ isAdmin: boolean; role: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      console.warn('[ADMIN] Could not verify admin status:', error?.message);
      return { isAdmin: false, role: null };
    }

    const adminRoles = ['admin', 'super_admin', 'moderator'];
    return { 
      isAdmin: adminRoles.includes(data.role || ''), 
      role: data.role 
    };
  } catch (e: any) {
    console.error('[ADMIN] Verification exception:', e);
    return { isAdmin: false, role: null };
  }
};

// ============================================
// 7. SCHEMA RELOAD TRIGGER
// ============================================

export const triggerSchemaReload = async (): Promise<boolean> => {
  try {
    // This requires the pg_notify function to be available
    // The actual NOTIFY is done via SQL, this is a placeholder for client-side trigger
    console.log('[SCHEMA] Schema reload requested');
    return true;
  } catch (e) {
    console.error('[SCHEMA] Reload trigger failed:', e);
    return false;
  }
};

// ============================================
// 8. CONNECTION HEALTH CHECK
// ============================================

export const checkConnection = async (): Promise<{ connected: boolean; latency: number }> => {
  const start = Date.now();
  try {
    const { error } = await supabase.from('user_profiles').select('count').limit(1).single();
    const latency = Date.now() - start;
    
    if (error && !error.message.includes('rows')) {
      return { connected: false, latency };
    }
    
    return { connected: true, latency };
  } catch (e) {
    return { connected: false, latency: Date.now() - start };
  }
};

// ============================================
// 9. DEVELOPMENT LOGGING
// ============================================

if (typeof window !== 'undefined') {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('preview');
  
  if (isDev) {
    console.log('[Supabase] Environment verified');
    console.log('[Supabase] Project URL:', verifiedUrl);
    console.log('[Supabase] Client initialized with PKCE flow');
    
    // Add global debug helper
    (window as any).__supabaseDebug = {
      verifySession,
      checkConnection,
      clearAuth: clearSupabaseAuth,
      verifyAdmin: verifyAdminAccess,
    };
  }
}
