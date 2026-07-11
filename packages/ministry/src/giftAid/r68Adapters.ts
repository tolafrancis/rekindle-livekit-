// =============================================================================
// Gift Aid — app adapters (frontend)  ·  Folder: src/lib/giftAid/
// -----------------------------------------------------------------------------
// Maps this app's CharityDetails / ClaimLineItem shapes onto the pure, shared
// R68 builder types in supabase/functions/_shared/. Keeping the adapters here
// (and the builder in _shared) means the XML-producing bytes never drift
// between the browser export and the edge function.
// =============================================================================

import type { CharityDetails, ClaimLineItem } from './claimsService';
import type { R68Charity, R68LineItem, Regulator } from '../../../../supabase/functions/_shared/r68Builder';

export function toRegulator(charity: CharityDetails): Regulator {
  const type = String((charity as any).regulatorType || 'CCEW');
  const regNo = (charity as any).regulatorNumber || '';
  switch (type) {
    case 'none':  return { kind: 'none' };
    case 'other': return { kind: 'other', otherReg: (charity as any).regulatorOtherName || '', regNo: regNo || undefined };
    case 'CCEW': case 'CCNI': case 'OSCR': return { kind: 'named', regName: type, regNo };
    default: return { kind: 'named', regName: 'CCEW', regNo };
  }
}

export function toR68Charity(charity: CharityDetails): R68Charity {
  const parts = String(charity.authorisedOfficialName || '').trim().split(/\s+/).filter(Boolean);
  return {
    orgName: charity.charityName || '',
    hmrcRef: charity.hmrcReference || '',
    officialFore: parts[0] || '',
    officialSur: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || ''),
    officialPhone: charity.authorisedOfficialPhone || '',
    officialPostcode: charity.authorisedOfficialPostcode || '',
    regulator: toRegulator(charity),
  };
}

export function toR68LineItems(items: ClaimLineItem[]): R68LineItem[] {
  return items.map((it) => ({
    fore: it.firstName || '', sur: it.lastName || '',
    house: it.houseNumberOrName || it.addressLine1 || '',
    postcode: it.postcode || '', date: it.donationDate, total: it.amount,
  }));
}
