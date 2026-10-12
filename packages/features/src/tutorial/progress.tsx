// Tutorial progress: saved on the device first (instant, works offline) and
// mirrored to the existing user_profiles.metadata JSONB under `tutorials`, so
// it follows the user across devices without a new table. Every failure here
// is swallowed: progress that can't be saved must never get in the way of the
// app.
import { supabase } from '@rekindle/supabase';
import type { TutorialProgressState, TutorialRecord, WelcomeRecord } from './types';

const STORAGE_PREFIX = 'rk_tutorials_v1_';

export const emptyProgress = (): TutorialProgressState => ({ v: 1, tutorials: {} });

const newer = <T extends { updatedAt: string }>(a: T | undefined, b: T | undefined): T | undefined => {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
};

/** Normalises anything read from storage or the server into a valid state. */
export function sanitizeProgress(raw: unknown): TutorialProgressState {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<TutorialProgressState>;
  const statuses = ['in_progress', 'completed', 'skipped'];
  if (r.tutorials && typeof r.tutorials === 'object') {
    for (const [id, rec] of Object.entries(r.tutorials)) {
      if (!rec || typeof rec !== 'object') continue;
      const t = rec as TutorialRecord;
      if (!statuses.includes(t.status) || typeof t.updatedAt !== 'string') continue;
      out.tutorials[id] = {
        status: t.status,
        step: Number.isFinite(t.step) && t.step >= 0 ? Math.floor(t.step) : 0,
        updatedAt: t.updatedAt,
        ...(t.completedAt ? { completedAt: t.completedAt } : {}),
      };
    }
  }
  const w = r.welcome as WelcomeRecord | undefined;
  if (w && ['completed', 'dismissed', 'later'].includes(w.status) && typeof w.updatedAt === 'string') {
    out.welcome = { ...w };
  }
  return out;
}

/** Per tutorial (and for the welcome), the most recently updated record wins. */
export function mergeProgress(a: TutorialProgressState, b: TutorialProgressState): TutorialProgressState {
  const out = emptyProgress();
  out.welcome = newer(a.welcome, b.welcome);
  if (!out.welcome) delete out.welcome;
  const ids = new Set([...Object.keys(a.tutorials), ...Object.keys(b.tutorials)]);
  ids.forEach((id) => {
    const rec = newer(a.tutorials[id], b.tutorials[id]);
    if (rec) out.tutorials[id] = rec;
  });
  return out;
}

export const sameProgress = (a: TutorialProgressState, b: TutorialProgressState) =>
  JSON.stringify(mergeProgress(a, emptyProgress())) === JSON.stringify(mergeProgress(b, emptyProgress()));

export function loadLocalProgress(userId: string): TutorialProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    return raw ? sanitizeProgress(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveLocalProgress(userId: string, state: TutorialProgressState): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the in-memory state still works this session */
  }
}

/** The copy saved on the user's profile, or null if it can't be read. */
export async function fetchRemoteProgress(userId: string): Promise<TutorialProgressState | null> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return sanitizeProgress((data.metadata as Record<string, unknown> | null)?.tutorials);
  } catch {
    return null;
  }
}

/** Writes progress into metadata.tutorials. Re-reads metadata just before the
 *  write and only replaces the `tutorials` key, so other metadata survives. */
export async function pushRemoteProgress(userId: string, state: TutorialProgressState): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return false;
    const metadata = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>;
    const merged = mergeProgress(sanitizeProgress(metadata.tutorials), state);
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ metadata: { ...metadata, tutorials: merged } })
      .eq('user_id', userId);
    return !updateError;
  } catch {
    return false;
  }
}
