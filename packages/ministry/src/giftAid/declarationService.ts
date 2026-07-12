// =============================================================================
// Gift Aid — declaration service (Phase 1)
// -----------------------------------------------------------------------------
// Client-side helpers used by donor-facing forms to:
//   • read whether a ministry has Gift Aid enabled (public),
//   • read a donor's current Gift Aid status (for inheritance/prefill),
//   • submit a declaration.
//
// Submission goes through the `gift-aid-declaration` edge function so the donor
// IP is captured server-side (trustworthy evidence) and the declaration +
// donor status + audit row are written atomically with the service role. If the
// function is unavailable, it falls back to a direct insert so the feature still
// degrades gracefully and never blocks a donation.
// =============================================================================

import { supabase } from '@rekindle/supabase';
import {
  GIFT_AID_DECLARATION_TEXT,
  GIFT_AID_DECLARATION_VERSION,
} from './constants';

export interface GiftAidPublicSettings {
  enabled: boolean;
  charityName: string | null;
}

export interface GiftAidDeclarationInput {
  ministryId: string;
  donorUserId?: string | null;
  donorEmail: string;
  title?: string;
  firstName: string;
  lastName: string;
  houseNumberOrName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode: string;
  countryCode?: string; // defaults to GB
  isTaxpayerConfirmed: boolean;
  source?: string; // e.g. 'ministry_donation_form'
}

export interface GiftAidDeclarationResult {
  ok: boolean;
  declarationId?: string;
  error?: string;
}

/** Read public Gift Aid settings for a ministry (safe for guests). */
export async function loadGiftAidSettings(
  ministryId: string,
): Promise<GiftAidPublicSettings> {
  try {
    const { data, error } = await supabase
      .from('ministry_gift_aid_settings')
      .select('enabled, charity_name')
      .eq('ministry_id', ministryId)
      .maybeSingle();
    if (error) throw error;
    return {
      enabled: !!data?.enabled,
      charityName: data?.charity_name ?? null,
    };
  } catch (err) {
    console.warn('loadGiftAidSettings failed:', err);
    return { enabled: false, charityName: null };
  }
}

/** Current Gift Aid status for a donor in a ministry, or null if none. */
export async function loadDonorGiftAidStatus(
  ministryId: string,
  donorEmail: string,
): Promise<string | null> {
  if (!donorEmail) return null;
  try {
    const { data, error } = await supabase
      .from('donor_gift_aid_status')
      .select('status')
      .eq('ministry_id', ministryId)
      .eq('donor_email', donorEmail)
      .maybeSingle();
    if (error) throw error;
    return data?.status ?? null;
  } catch (err) {
    console.warn('loadDonorGiftAidStatus failed:', err);
    return null;
  }
}

/**
 * Submit a Gift Aid declaration. Captures the exact declaration text + version
 * plus the user agent and platform. IP is added server-side by the edge
 * function. Returns a result object — callers should treat failure as
 * non-fatal to the donation itself.
 */
export async function submitGiftAidDeclaration(
  input: GiftAidDeclarationInput,
): Promise<GiftAidDeclarationResult> {
  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent : null;
  const platform =
    typeof navigator !== 'undefined'
      ? // navigator.platform is deprecated but still widely present; fall back gracefully
        (navigator as any).userAgentData?.platform || navigator.platform || null
      : null;

  const payload = {
    ministryId: input.ministryId,
    donorUserId: input.donorUserId || null,
    donorEmail: input.donorEmail,
    title: input.title || null,
    firstName: input.firstName,
    lastName: input.lastName,
    houseNumberOrName: input.houseNumberOrName || null,
    addressLine1: input.addressLine1 || null,
    addressLine2: input.addressLine2 || null,
    city: input.city || null,
    postcode: input.postcode,
    countryCode: input.countryCode || 'GB',
    isTaxpayerConfirmed: input.isTaxpayerConfirmed,
    declarationText: GIFT_AID_DECLARATION_TEXT,
    declarationVersion: GIFT_AID_DECLARATION_VERSION,
    source: input.source || 'donation_form',
    userAgent,
    platform,
  };

  // Primary path: edge function (server-side IP + service-role writes).
  try {
    const { data, error } = await supabase.functions.invoke('gift-aid-declaration', {
      body: payload,
    });
    if (!error && data && !data.error) {
      return { ok: true, declarationId: data.declarationId };
    }
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  } catch (fnErr: any) {
    console.warn('gift-aid-declaration function unavailable, falling back to direct insert:', fnErr);
  }

  // Fallback path: direct insert (RLS allows this when Gift Aid is enabled).
  try {
    const { data, error } = await supabase
      .from('gift_aid_declarations')
      .insert({
        ministry_id: input.ministryId,
        donor_user_id: input.donorUserId || null,
        donor_email: input.donorEmail,
        title: input.title || null,
        first_name: input.firstName,
        last_name: input.lastName,
        house_number_or_name: input.houseNumberOrName || null,
        address_line1: input.addressLine1 || null,
        address_line2: input.addressLine2 || null,
        city: input.city || null,
        postcode: input.postcode,
        country_code: input.countryCode || 'GB',
        is_taxpayer_confirmed: input.isTaxpayerConfirmed,
        declaration_text: GIFT_AID_DECLARATION_TEXT,
        declaration_version: GIFT_AID_DECLARATION_VERSION,
        source: input.source || 'donation_form',
        user_agent: userAgent,
        platform,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw error;

    // Best-effort rollup + audit (non-fatal).
    try {
      await supabase.from('donor_gift_aid_status').upsert(
        {
          ministry_id: input.ministryId,
          donor_user_id: input.donorUserId || null,
          donor_email: input.donorEmail,
          status: 'active',
          current_declaration_id: data.id,
          effective_from: new Date().toISOString().slice(0, 10),
        },
        { onConflict: 'ministry_id,donor_email' },
      );
    } catch (statusErr) {
      console.warn('donor_gift_aid_status upsert failed:', statusErr);
    }
    try {
      await supabase.from('gift_aid_audit_log').insert({
        ministry_id: input.ministryId,
        declaration_id: data.id,
        actor_user_id: input.donorUserId || null,
        event_type: 'declaration_created',
        event_data: { source: input.source || 'donation_form', via: 'client_fallback' },
        user_agent: userAgent,
      });
    } catch (auditErr) {
      console.warn('gift_aid_audit_log insert failed:', auditErr);
    }

    return { ok: true, declarationId: data.id };
  } catch (insErr: any) {
    console.error('Gift Aid declaration insert failed:', insErr);
    return { ok: false, error: insErr.message || 'Failed to record declaration' };
  }
}

// =============================================================================
// Admin declaration management (used by the Declarations tab)
// -----------------------------------------------------------------------------
// Declarations are IMMUTABLE evidence: we never edit the donor's original record
// in place. To "correct" a donor's details (e.g. a missing postcode) we insert a
// NEW active declaration and mark the previous one superseded — the original
// stays as evidence, the corrected one becomes the donor's current declaration
// and flows through to claim completeness.
// =============================================================================

export type DeclarationStatus = 'active' | 'withdrawn' | 'superseded' | 'pending' | string;

export interface DeclarationRow {
  id: string;
  ministryId: string;
  donorEmail: string;
  donorUserId: string | null;
  title: string | null;
  firstName: string;
  lastName: string;
  houseNumberOrName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string;
  countryCode: string;
  status: DeclarationStatus;
  source: string | null;
  supersededBy: string | null;
  createdAt: string;
}

/** True when a declaration has everything HMRC needs on the address (house + postcode). */
export function isDeclarationComplete(d: {
  firstName?: string | null; lastName?: string | null;
  houseNumberOrName?: string | null; addressLine1?: string | null; postcode?: string | null;
}): boolean {
  const house = (d.houseNumberOrName || d.addressLine1 || '').trim();
  return Boolean((d.firstName || '').trim() && (d.lastName || '').trim() && house && (d.postcode || '').trim());
}

function mapDeclaration(r: any): DeclarationRow {
  return {
    id: r.id,
    ministryId: r.ministry_id,
    donorEmail: r.donor_email,
    donorUserId: r.donor_user_id,
    title: r.title,
    firstName: r.first_name,
    lastName: r.last_name,
    houseNumberOrName: r.house_number_or_name,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    city: r.city,
    postcode: r.postcode,
    countryCode: r.country_code || 'GB',
    status: r.status,
    source: r.source,
    supersededBy: r.superseded_by,
    createdAt: r.created_at,
  };
}

/** All declarations for a ministry, newest first (for the admin Declarations tab). */
export async function listDeclarations(ministryId: string): Promise<DeclarationRow[]> {
  const { data, error } = await supabase
    .from('gift_aid_declarations')
    .select('id, ministry_id, donor_email, donor_user_id, title, first_name, last_name, house_number_or_name, address_line1, address_line2, city, postcode, country_code, status, source, superseded_by, created_at')
    .eq('ministry_id', ministryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDeclaration);
}

export interface AdminDeclarationInput {
  ministryId: string;
  donorEmail: string;
  donorUserId?: string | null;
  title?: string | null;
  firstName: string;
  lastName: string;
  houseNumberOrName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode: string;
  countryCode?: string;
  isTaxpayerConfirmed?: boolean;
}

/**
 * Record an admin-entered declaration. If `supersedeId` is given, the corrected
 * record supersedes that existing declaration (evidence-preserving edit);
 * otherwise it's a brand-new declaration (e.g. a paper form keyed in).
 */
export async function saveAdminDeclaration(
  input: AdminDeclarationInput,
  opts: { supersedeId?: string | null; actorUserId?: string | null } = {},
): Promise<GiftAidDeclarationResult> {
  try {
    const { data: created, error } = await supabase
      .from('gift_aid_declarations')
      .insert({
        ministry_id: input.ministryId,
        donor_user_id: input.donorUserId || null,
        donor_email: input.donorEmail,
        title: input.title || null,
        first_name: input.firstName,
        last_name: input.lastName,
        house_number_or_name: input.houseNumberOrName || null,
        address_line1: input.addressLine1 || null,
        address_line2: input.addressLine2 || null,
        city: input.city || null,
        postcode: input.postcode,
        country_code: input.countryCode || 'GB',
        is_taxpayer_confirmed: input.isTaxpayerConfirmed ?? true,
        declaration_text: GIFT_AID_DECLARATION_TEXT,
        declaration_version: GIFT_AID_DECLARATION_VERSION,
        source: opts.supersedeId ? 'admin_correction' : 'admin_entry',
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw error;
    const newId = created.id;

    // Mark the superseded declaration (evidence stays; it just isn't current).
    if (opts.supersedeId) {
      try {
        await supabase
          .from('gift_aid_declarations')
          .update({ status: 'superseded', superseded_by: newId })
          .eq('id', opts.supersedeId);
      } catch (supErr) {
        console.warn('supersede update failed:', supErr);
      }
    }

    // Point the donor's rollup at the new current declaration (best-effort).
    try {
      await supabase.from('donor_gift_aid_status').upsert(
        {
          ministry_id: input.ministryId,
          donor_user_id: input.donorUserId || null,
          donor_email: input.donorEmail,
          status: 'active',
          current_declaration_id: newId,
          effective_from: new Date().toISOString().slice(0, 10),
        },
        { onConflict: 'ministry_id,donor_email' },
      );
    } catch (statusErr) {
      console.warn('donor_gift_aid_status upsert failed:', statusErr);
    }

    try {
      await supabase.from('gift_aid_audit_log').insert({
        ministry_id: input.ministryId,
        declaration_id: newId,
        actor_user_id: opts.actorUserId || null,
        event_type: opts.supersedeId ? 'declaration_corrected' : 'declaration_created',
        event_data: { source: opts.supersedeId ? 'admin_correction' : 'admin_entry', superseded: opts.supersedeId || null },
      });
    } catch (auditErr) {
      console.warn('gift_aid_audit_log insert failed:', auditErr);
    }

    return { ok: true, declarationId: newId };
  } catch (err: any) {
    console.error('saveAdminDeclaration failed:', err);
    return { ok: false, error: err.message || 'Failed to save declaration' };
  }
}

/** Withdraw a declaration (donor is no longer a taxpayer / asked to opt out). */
export async function withdrawDeclaration(
  declarationId: string,
  ministryId: string,
  actorUserId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('gift_aid_declarations')
    .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
    .eq('id', declarationId);
  if (error) throw error;
  try {
    await supabase.from('gift_aid_audit_log').insert({
      ministry_id: ministryId,
      declaration_id: declarationId,
      actor_user_id: actorUserId || null,
      event_type: 'declaration_withdrawn',
      event_data: { via: 'admin' },
    });
  } catch (e) {
    console.warn('audit (declaration_withdrawn) failed:', e);
  }
}
