import { supabase } from '@rekindle/supabase';

// Generic key/value platform-wide feature toggle store (platform_settings,
// migration 0266). Readable by everyone — writable by platform admins only
// (enforced by RLS, not here). Add new keys as needed; no migration required
// per toggle, just an insert.

export async function getPlatformSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle();
  if (!data) return fallback;
  return (data.value as T) ?? fallback;
}

export async function setPlatformSetting(key: string, value: unknown): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: user?.id ?? null });
  if (error) return { error: error.message };
  return {};
}
