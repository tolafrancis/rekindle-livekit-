// =============================================================================
// Gift Aid — R68 builder (frontend re-export)  ·  Folder: src/lib/giftAid/
// -----------------------------------------------------------------------------
// The canonical, LTS-verified R68 v2 builder + GovTalk envelope live in
// supabase/functions/_shared/ so the browser export and the edge function share
// the EXACT same bytes (IRmark, element order, C14N-safe escaping). This module
// just re-exports them so existing `@/lib/giftAid` / './r68Builder' imports keep
// working.
//
// ⚠ Do NOT fork the builder logic here — edit the _shared files and both callers
//   follow. App-data adapters (CharityDetails/ClaimLineItem → R68 types) live in
//   ./r68Adapters.
// =============================================================================

export * from '../../../supabase/functions/_shared/r68Builder';
export * from '../../../supabase/functions/_shared/giftAidEnvelope';
