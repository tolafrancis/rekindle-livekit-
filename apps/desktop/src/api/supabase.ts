import { createClient } from '@supabase/supabase-js';

// Default Supabase project endpoints for ReKindle Live Translation
export const DEFAULT_SUPABASE_URL = 'https://vpnpembyqbbaaiynfvli.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8';

export const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string) || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export interface AuthenticateDeviceResult {
  token: string;
  expires_at: string;
  device_id: string;
  ministry_id: string;
}

export interface DeviceStartSessionResult {
  session_id: string;
  room_name: string;
  speaker_identity: string;
}

/**
 * Authenticates a hardware edge device via its raw key (rlt_...).
 * Returns a 24-hour bearer token for subsequent RPCs.
 */
export async function authenticateDevice(deviceKey: string): Promise<AuthenticateDeviceResult> {
  const cleanKey = deviceKey.trim();
  if (!cleanKey) {
    throw new Error('Device key is required');
  }

  const { data, error } = await supabase.rpc('authenticate_device', {
    p_device_key: cleanKey,
  });

  if (error) {
    throw new Error(error.message || 'Failed to authenticate device');
  }

  if (!data || !data.token) {
    throw new Error('Invalid response from authentication server');
  }

  return data as AuthenticateDeviceResult;
}

/**
 * Heartbeat keepalive invoked on a 60-second interval.
 * Slides token expiration by +24 hours and updates device last_ping.
 */
export async function deviceHeartbeat(bearerToken: string): Promise<boolean> {
  if (!bearerToken) return false;

  const { data, error } = await supabase.rpc('device_heartbeat', {
    p_token: bearerToken,
  });

  if (error) {
    console.error('[Supabase RPC] device_heartbeat failed:', error.message);
    return false;
  }

  return !!data?.ok;
}

/**
 * Starts a new translation session for the PA mixer pipeline.
 * Creates a translation_sessions row and emits pg_notify('bot_dispatch') for the cloud translation bot.
 */
export async function deviceStartSession(
  bearerToken: string,
  sourceLanguage: string,
  targetLanguage: string,
  serviceId?: string | null
): Promise<DeviceStartSessionResult> {
  const { data, error } = await supabase.rpc('device_start_session', {
    p_token: bearerToken,
    p_source_language: sourceLanguage,
    p_target_language: targetLanguage,
    p_service_id: serviceId ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to start device session');
  }

  if (!data || !data.session_id) {
    throw new Error('Server did not return a valid session ID');
  }

  return data as DeviceStartSessionResult;
}

/**
 * Updates session status (e.g. 'ended' or 'error').
 */
export async function deviceUpdateSession(
  sessionId: string,
  status: 'active' | 'ended' | 'error',
  errorMessage: string | null = null,
  bearerToken: string | null = null
): Promise<void> {
  const { error } = await supabase.rpc('device_update_session', {
    p_session_id: sessionId,
    p_status: status,
    p_error_message: errorMessage,
    p_token: bearerToken,
  });

  if (error) {
    console.error('[Supabase RPC] device_update_session error:', error.message);
  }
}
