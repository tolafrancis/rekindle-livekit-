// Testimonials about ReKindle BC (public.app_testimonials, 0412). Submitted
// from /testimonial, published by platform admins, shown on the landing page.
import { supabase } from '@rekindle/supabase';

export interface AppTestimonial {
  id: string;
  name: string;
  role: string | null;
  quote: string;
  is_published: boolean;
  display_order: number;
  created_at: string;
}

/** The link to send people so they can leave a testimonial. */
export const TESTIMONIAL_PATH = '/testimonial';

/** Published testimonials, in display order. Admin callers pass includeHidden. */
export async function fetchTestimonials(includeHidden = false): Promise<AppTestimonial[]> {
  let q = supabase
    .from('app_testimonials')
    .select('id, name, role, quote, is_published, display_order, created_at')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (!includeHidden) q = q.eq('is_published', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AppTestimonial[];
}

export async function submitTestimonial(input: { name: string; role?: string; quote: string }): Promise<void> {
  // No .select() after insert: visitors can't read hidden rows back.
  const { error } = await supabase.from('app_testimonials').insert({
    name: input.name.trim(),
    role: input.role?.trim() || null,
    quote: input.quote.trim(),
    consent: true,
  });
  if (error) throw error;
}
