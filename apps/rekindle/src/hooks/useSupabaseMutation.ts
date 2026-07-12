// src/hooks/useSupabaseMutation.ts
// Global mutation safety layer with automatic error handling and retry logic

import { useState, useCallback, useRef } from 'react';
import { supabase, safeMutation, MutationResult, verifySession } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface UseMutationOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  successMessage?: string;
  errorMessage?: string;
  requireAuth?: boolean;
  retries?: number;
  preventDoubleSubmit?: boolean;
}

interface MutationState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  success: boolean;
}

export function useSupabaseMutation<T = any>(options: UseMutationOptions = {}) {
  const { toast } = useToast();
  const [state, setState] = useState<MutationState<T>>({
    data: null,
    error: null,
    loading: false,
    success: false,
  });
  
  // Prevent double submissions
  const isSubmittingRef = useRef(false);
  const lastSubmitTimeRef = useRef(0);

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      loading: false,
      success: false,
    });
    isSubmittingRef.current = false;
  }, []);

  const mutate = useCallback(async (
    mutationFn: () => Promise<{ data: T | null; error: any }>
  ): Promise<MutationResult<T>> => {
    const {
      onSuccess,
      onError,
      successMessage,
      errorMessage,
      requireAuth = true,
      retries = 2,
      preventDoubleSubmit = true,
    } = options;

    // Prevent double submissions
    if (preventDoubleSubmit) {
      const now = Date.now();
      if (isSubmittingRef.current || (now - lastSubmitTimeRef.current < 1000)) {
        console.warn('[MUTATION] Prevented double submission');
        return { data: null, error: 'Please wait before submitting again', success: false };
      }
      isSubmittingRef.current = true;
      lastSubmitTimeRef.current = now;
    }

    // Set loading state
    setState(prev => ({ ...prev, loading: true, error: null, success: false }));

    try {
      const result = await safeMutation<T>(mutationFn, {
        retries,
        requireAuth,
        onSuccess: (data) => {
          onSuccess?.(data);
          if (successMessage) {
            toast({
              title: 'Success',
              description: successMessage,
            });
          }
        },
        onError: (error) => {
          onError?.(error);
          toast({
            title: 'Error',
            description: errorMessage || error,
            variant: 'destructive',
          });
        },
      });

      setState({
        data: result.data,
        error: result.error,
        loading: false,
        success: result.success,
      });

      return result;
    } catch (e: any) {
      const error = e.message || 'An unexpected error occurred';
      setState({
        data: null,
        error,
        loading: false,
        success: false,
      });
      
      toast({
        title: 'Error',
        description: errorMessage || error,
        variant: 'destructive',
      });

      return { data: null, error, success: false };
    } finally {
      // Reset submission lock after a delay
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 500);
    }
  }, [options, toast]);

  return {
    ...state,
    mutate,
    reset,
    isSubmitting: isSubmittingRef.current,
  };
}

// ============================================
// SPECIALIZED MUTATION HOOKS
// ============================================

// Insert mutation
export function useInsert<T = any>(
  table: string,
  options: UseMutationOptions = {}
) {
  const mutation = useSupabaseMutation<T>(options);

  const insert = useCallback(async (data: Partial<T> | Partial<T>[]) => {
    return mutation.mutate(async () => {
      const { data: result, error } = await supabase
        .from(table)
        .insert(data as any)
        .select()
        .single();
      return { data: result as T, error };
    });
  }, [table, mutation]);

  const insertMany = useCallback(async (data: Partial<T>[]) => {
    return mutation.mutate(async () => {
      const { data: result, error } = await supabase
        .from(table)
        .insert(data as any)
        .select();
      return { data: result as T, error };
    });
  }, [table, mutation]);

  return { ...mutation, insert, insertMany };
}

// Update mutation
export function useUpdate<T = any>(
  table: string,
  options: UseMutationOptions = {}
) {
  const mutation = useSupabaseMutation<T>(options);

  const update = useCallback(async (
    id: string,
    data: Partial<T>,
    idColumn: string = 'id'
  ) => {
    return mutation.mutate(async () => {
      const { data: result, error } = await supabase
        .from(table)
        .update(data as any)
        .eq(idColumn, id)
        .select()
        .single();
      return { data: result as T, error };
    });
  }, [table, mutation]);

  const updateWhere = useCallback(async (
    conditions: Record<string, any>,
    data: Partial<T>
  ) => {
    return mutation.mutate(async () => {
      let query = supabase.from(table).update(data as any);
      
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(key, value);
      }
      
      const { data: result, error } = await query.select().single();
      return { data: result as T, error };
    });
  }, [table, mutation]);

  return { ...mutation, update, updateWhere };
}

// Delete mutation
export function useDelete<T = any>(
  table: string,
  options: UseMutationOptions = {}
) {
  const mutation = useSupabaseMutation<T>(options);

  const remove = useCallback(async (id: string, idColumn: string = 'id') => {
    return mutation.mutate(async () => {
      const { data: result, error } = await supabase
        .from(table)
        .delete()
        .eq(idColumn, id)
        .select()
        .single();
      return { data: result as T, error };
    });
  }, [table, mutation]);

  const removeWhere = useCallback(async (conditions: Record<string, any>) => {
    return mutation.mutate(async () => {
      let query = supabase.from(table).delete();
      
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(key, value);
      }
      
      const { data: result, error } = await query.select();
      return { data: result as T, error };
    });
  }, [table, mutation]);

  return { ...mutation, remove, removeWhere };
}

// Upsert mutation
export function useUpsert<T = any>(
  table: string,
  options: UseMutationOptions = {}
) {
  const mutation = useSupabaseMutation<T>(options);

  const upsert = useCallback(async (
    data: Partial<T> | Partial<T>[],
    onConflict?: string
  ) => {
    return mutation.mutate(async () => {
      const query = supabase.from(table).upsert(data as any, {
        onConflict: onConflict,
      });
      
      const { data: result, error } = await query.select();
      return { data: result as T, error };
    });
  }, [table, mutation]);

  return { ...mutation, upsert };
}

// ============================================
// REDIRECT AUTHORITY SYSTEM
// ============================================

export function useAuthorizedRedirect() {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const redirectAfterMutation = useCallback(async <T>(
    mutationFn: () => Promise<MutationResult<T>>,
    redirectPath: string,
    options: {
      requireSuccess?: boolean;
      delay?: number;
      onBeforeRedirect?: () => void;
    } = {}
  ) => {
    const { requireSuccess = true, delay = 100, onBeforeRedirect } = options;

    setIsRedirecting(true);
    
    try {
      const result = await mutationFn();

      if (requireSuccess && !result.success) {
        setIsRedirecting(false);
        return result;
      }

      // Wait for state to settle
      await new Promise(resolve => setTimeout(resolve, delay));

      onBeforeRedirect?.();

      // Use window.location for reliable navigation
      window.location.href = redirectPath;

      return result;
    } catch (e) {
      setIsRedirecting(false);
      throw e;
    }
  }, []);

  return { redirectAfterMutation, isRedirecting };
}
