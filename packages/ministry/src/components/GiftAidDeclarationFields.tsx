import React from 'react';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Checkbox } from '@rekindle/ui/checkbox';
import { HandCoins } from 'lucide-react';
import { GIFT_AID_DECLARATION_TEXT } from '../giftAid';

// UI-local state shape for the declaration form. The parent donation form owns
// this object and passes it down controlled.
export interface GiftAidFormState {
  optedIn: boolean;
  title: string;
  firstName: string;
  lastName: string;
  houseNumberOrName: string;
  addressLine1: string;
  city: string;
  postcode: string;
  taxpayerConfirmed: boolean;
}

export const emptyGiftAidState: GiftAidFormState = {
  optedIn: false,
  title: '',
  firstName: '',
  lastName: '',
  houseNumberOrName: '',
  addressLine1: '',
  city: '',
  postcode: '',
  taxpayerConfirmed: false,
};

/** True when an opted-in declaration has all the fields HMRC needs. */
export function isGiftAidDeclarationComplete(s: GiftAidFormState): boolean {
  if (!s.optedIn) return true; // not opting in is always valid
  return (
    s.taxpayerConfirmed &&
    s.firstName.trim().length > 0 &&
    s.lastName.trim().length > 0 &&
    (s.houseNumberOrName.trim().length > 0 || s.addressLine1.trim().length > 0) &&
    s.postcode.trim().length > 0
  );
}

interface Props {
  value: GiftAidFormState;
  onChange: (next: GiftAidFormState) => void;
  charityName?: string | null;
  /** Theme accent used by the host form. */
  themeColor?: string;
  /** Shown when the donor already has an active declaration on file. */
  alreadyDeclared?: boolean;
}

export const GiftAidDeclarationFields: React.FC<Props> = ({
  value,
  onChange,
  charityName,
  themeColor = '#7c3aed',
  alreadyDeclared = false,
}) => {
  const set = (patch: Partial<GiftAidFormState>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Checkbox
          id="gift-aid-opt-in"
          checked={value.optedIn}
          onCheckedChange={(checked) => set({ optedIn: checked === true })}
          className="mt-0.5"
        />
        <Label htmlFor="gift-aid-opt-in" className="cursor-pointer leading-snug">
          <span className="flex items-center gap-1.5 font-medium">
            <HandCoins className="h-4 w-4" style={{ color: themeColor }} />
            Add Gift Aid — boost your donation by 25% at no cost to you
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">
            {charityName ? `${charityName} can` : 'We can'} reclaim 25p of tax on every £1 you
            give, if you are a UK taxpayer.
          </span>
        </Label>
      </div>

      {alreadyDeclared && !value.optedIn && (
        <p className="text-xs text-green-700">
          You already have an active Gift Aid declaration on file — future donations are covered
          automatically.
        </p>
      )}

      {value.optedIn && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={value.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Mr/Mrs/Ms"
              />
            </div>
            <div>
              <Label className="text-xs">First name *</Label>
              <Input
                value={value.firstName}
                onChange={(e) => set({ firstName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Last name *</Label>
              <Input
                value={value.lastName}
                onChange={(e) => set({ lastName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">House number / name *</Label>
              <Input
                value={value.houseNumberOrName}
                onChange={(e) => set({ houseNumberOrName: e.target.value })}
                placeholder="e.g. 12 or Rose Cottage"
              />
            </div>
            <div>
              <Label className="text-xs">Postcode *</Label>
              <Input
                value={value.postcode}
                onChange={(e) => set({ postcode: e.target.value.toUpperCase() })}
                placeholder="e.g. SW1A 1AA"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Address line</Label>
              <Input
                value={value.addressLine1}
                onChange={(e) => set({ addressLine1: e.target.value })}
                placeholder="Street / area"
              />
            </div>
            <div>
              <Label className="text-xs">Town / city</Label>
              <Input
                value={value.city}
                onChange={(e) => set({ city: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-md bg-gray-50 border p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="gift-aid-taxpayer"
                checked={value.taxpayerConfirmed}
                onCheckedChange={(checked) => set({ taxpayerConfirmed: checked === true })}
                className="mt-0.5"
              />
              <Label htmlFor="gift-aid-taxpayer" className="cursor-pointer text-xs leading-relaxed text-gray-700">
                {GIFT_AID_DECLARATION_TEXT}
              </Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GiftAidDeclarationFields;
