// =============================================================================
// Gift Aid — shared constants & types (Phase 0 foundation)
// -----------------------------------------------------------------------------
// Versioned declaration wording lives here so that every declaration row stores
// the exact text + version the donor agreed to (immutable evidence). When the
// wording changes, bump GIFT_AID_DECLARATION_VERSION and add the new text — old
// rows keep their original text, so historical evidence is preserved.
// =============================================================================

/** Bump this whenever GIFT_AID_DECLARATION_TEXT changes. */
export const GIFT_AID_DECLARATION_VERSION = '2026-06-v1';

/**
 * Standard HMRC-style Gift Aid declaration wording (single + future + past 4
 * years). Shown to the donor and stored verbatim with each declaration.
 */
export const GIFT_AID_DECLARATION_TEXT =
  'I want to Gift Aid my donation and any donations I make in the future or ' +
  'have made in the past 4 years to this charity. I am a UK taxpayer and ' +
  'understand that if I pay less Income Tax and/or Capital Gains Tax than the ' +
  'amount of Gift Aid claimed on all my donations in that tax year it is my ' +
  'responsibility to pay any difference.';

// -- enums (kept in sync with the CHECK constraints in the SQL migration) -----

export type GiftAidSubmissionMethod = 'manual' | 'csv' | 'xml' | 'api';

export type GiftAidDeclarationStatus =
  | 'active'
  | 'withdrawn'
  | 'pending'
  | 'superseded';

export type DonorGiftAidStatus =
  | 'active'
  | 'withdrawn'
  | 'pending'
  | 'not_declared';

// -- row shapes (subset; convenience types for later phases) ------------------

export interface MinistryGiftAidSettings {
  id: string;
  ministry_id: string;
  enabled: boolean;
  charity_name: string | null;
  charity_registration_number: string | null;
  hmrc_reference: string | null;
  contact_person: string | null;
  contact_email: string | null;
  submission_method: GiftAidSubmissionMethod;
  claim_reference_prefix: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiftAidDeclaration {
  id: string;
  ministry_id: string;
  donor_user_id: string | null;
  donor_email: string;
  title: string | null;
  first_name: string;
  last_name: string;
  house_number_or_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string;
  country_code: string;
  covers_this_donation: boolean;
  covers_future: boolean;
  covers_past_4_years: boolean;
  is_taxpayer_confirmed: boolean;
  declaration_text: string;
  declaration_version: string;
  status: GiftAidDeclarationStatus;
  superseded_by: string | null;
  withdrawn_at: string | null;
  source: string | null;
  captured_ip: string | null;
  user_agent: string | null;
  platform: string | null;
  created_at: string;
}

export interface DonorGiftAidStatusRow {
  id: string;
  ministry_id: string;
  donor_user_id: string | null;
  donor_email: string;
  status: DonorGiftAidStatus;
  current_declaration_id: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export type GiftAidAuditEventType =
  | 'declaration_created'
  | 'declaration_withdrawn'
  | 'status_changed'
  | 'settings_updated'
  | 'claim_exported'
  | string;

export interface GiftAidAuditLogRow {
  id: string;
  ministry_id: string | null;
  declaration_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  event_type: GiftAidAuditEventType;
  event_data: Record<string, unknown>;
  captured_ip: string | null;
  user_agent: string | null;
  created_at: string;
}
