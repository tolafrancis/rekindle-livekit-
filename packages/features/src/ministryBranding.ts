import { useEffect } from 'react';
import { useCurrentMinistry } from './CurrentMinistryContext';
import { useMinistryEntitlements } from './useMinistryEntitlements';

// Phase 6 — per-ministry branding. Applies the current ministry's theme color to the
// design-system CSS variables (so the whole shell rebrands) and surfaces its name/logo.
// The `branding` tier cap gates theming; `whiteLabel` gates hiding the ReKindle wordmark.

export interface MinistryBranding {
  name: string | null;
  logoUrl: string | null;
  themeColor: string | null;
  /** Tier permits applying the ministry's own theme color. */
  canBrand: boolean;
  /** Tier permits full white-label (drop the ReKindle wordmark). */
  whiteLabel: boolean;
}

/** #rrggbb → "H S% L%" (the shadcn/Tailwind CSS-variable format). Null if unparseable. */
export function hexToHslVar(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Current ministry's branding + a side effect that themes the design system to its
 * color (only when the tier's `branding` cap is on). Reverts on unmount / ministry change.
 */
export function useMinistryBranding(): MinistryBranding {
  const { currentMinistry } = useCurrentMinistry();
  const { entitlements } = useMinistryEntitlements();
  const canBrand = entitlements.caps.branding;
  const whiteLabel = entitlements.caps.whiteLabel;
  const themeColor = currentMinistry?.themeColor ?? null;

  useEffect(() => {
    if (!canBrand) return;
    const hsl = hexToHslVar(themeColor);
    if (!hsl) return;
    const root = document.documentElement;
    const prevPrimary = root.style.getPropertyValue('--primary');
    const prevRing = root.style.getPropertyValue('--ring');
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--ring', hsl);
    return () => {
      root.style.setProperty('--primary', prevPrimary);
      root.style.setProperty('--ring', prevRing);
    };
  }, [canBrand, themeColor]);

  return {
    name: currentMinistry?.name ?? null,
    logoUrl: currentMinistry?.logoUrl ?? null,
    themeColor,
    canBrand,
    whiteLabel,
  };
}
