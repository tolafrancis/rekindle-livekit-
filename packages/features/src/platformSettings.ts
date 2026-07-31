import { supabase } from '@rekindle/supabase';

// Generic key/value platform-wide feature toggle store (platform_settings,
// migration 0266). Readable by everyone — writable by platform admins only
// (enforced by RLS, not here). Add new keys as needed; no migration required
// per toggle, just an insert.

export async function getPlatformSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle();
  if (error) {
    // Was silently swallowed before — a query error (e.g. more than one row
    // matching `key`, an RLS issue) fell back to `fallback` with no trace,
    // which looked identical to "setting not saved yet".
    console.error(`[platformSettings] getPlatformSetting(${key}) failed:`, error.message);
    return fallback;
  }
  if (!data || data.value == null) return fallback;
  const raw = data.value;
  // The live platform_settings table predates this feature — its `value`
  // column turned out to be `text`, not the `jsonb` this was designed
  // against (create table if not exists silently kept the pre-existing
  // shape). A stored boolean round-trips as the STRING "false"/"true",
  // which `?? fallback` never catches (non-empty strings aren't nullish)
  // and which is truthy in JS regardless of its content. Parse defensively
  // so this is correct whether the column is genuinely jsonb or plain text.
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
  }
  return raw as T;
}

export async function setPlatformSetting(key: string, value: unknown): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  // onConflict: 'key' is required here — this table's actual primary key is
  // `id` (a pre-existing table from before this feature; see 0267), not the
  // `key` column, so upsert() without it tries to INSERT and collides with
  // the unique constraint on `key` instead of updating the existing row.
  const { error } = await supabase
    .from('platform_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: user?.id ?? null },
      { onConflict: 'key' },
    );
  if (error) return { error: error.message };
  return {};
}
