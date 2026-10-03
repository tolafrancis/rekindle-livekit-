// Admin-managed FAQ (public.faq_items, 0393). Read by the landing page and the
// /faq page; written from the platform-admin FAQ tab.
import { supabase } from '@rekindle/supabase';

export type FaqAudience = 'general' | 'individual' | 'ministry';

export interface FaqItem {
  id: string;
  audience: FaqAudience;
  question: string;
  answer: string;
  display_order: number;
  is_published: boolean;
}

export const FAQ_AUDIENCE_LABELS: Record<FaqAudience, string> = {
  general: 'Everyone',
  individual: 'Individuals',
  ministry: 'Ministry leaders',
};

/** Published FAQ items, in display order. Admin callers pass includeDrafts. */
export async function fetchFaqItems(includeDrafts = false): Promise<FaqItem[]> {
  let q = supabase
    .from('faq_items')
    .select('id, audience, question, answer, display_order, is_published')
    .order('audience', { ascending: true })
    .order('display_order', { ascending: true });
  if (!includeDrafts) q = q.eq('is_published', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as FaqItem[];
}
