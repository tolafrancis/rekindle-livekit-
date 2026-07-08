// Shared utilities for displaying devotional / content categories consistently.
//
// Category names are authored in the database and have historically been
// inconsistent (ALL CAPS, duplicates, mixed casing, legacy labels). Rather than
// editing every row, we normalize names for display here so the whole app shows
// one clean, standardized label — and we can dedupe by that normalized label.

// Words that should stay lowercase in title case (unless first word).
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or',
  'the', 'to', 'vs', 'via', 'with',
]);

// Explicit renames / canonical labels. Keys are compared case-insensitively
// against the trimmed source name.
const CANONICAL_OVERRIDES: Record<string, string> = {
  'youth': 'Youth Affairs',
  'youths': 'Youth Affairs',
  'youth ministry': 'Youth Affairs',
  'spiritual disciplines': 'Spiritual Disciplines',
  'spiritual discipline': 'Spiritual Disciplines',
};

/** Title-case a phrase while keeping minor words lowercase. */
const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (!word) return word;
      // Preserve intentional ampersands / slashes split words gracefully.
      if (index !== 0 && MINOR_WORDS.has(word)) return word;
      // Capitalize each part of a hyphenated word (e.g. "self-control").
      return word
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join('-');
    })
    .join(' ');

/**
 * Normalize a category name for display: trims whitespace, applies canonical
 * renames, fixes ALL-CAPS / inconsistent casing to clean title case.
 */
export const formatCategoryName = (name?: string | null): string => {
  if (!name) return '';
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  const override = CANONICAL_OVERRIDES[trimmed.toLowerCase()];
  if (override) return override;

  return toTitleCase(trimmed);
};

// A friendly, distinct palette for category bullet indicators.
const BULLET_PALETTE = [
  '#7c3aed', // violet
  '#db2777', // pink
  '#ea580c', // orange
  '#0891b2', // cyan
  '#16a34a', // green
  '#2563eb', // blue
  '#d97706', // amber
  '#dc2626', // red
  '#0d9488', // teal
  '#9333ea', // purple
  '#65a30d', // lime
  '#e11d48', // rose
];

/**
 * Deterministic color for a category's bullet/indicator. Prefers an explicit
 * color (e.g. one stored on the category), otherwise derives a stable color
 * from the normalized name so the same category is always the same color.
 */
export const getCategoryColor = (name?: string | null, explicitColor?: string | null): string => {
  if (explicitColor && /^#?[0-9a-fA-F]{3,8}$/.test(explicitColor.trim())) {
    const c = explicitColor.trim();
    return c.startsWith('#') ? c : `#${c}`;
  }
  const normalized = formatCategoryName(name) || (name ?? '');
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return BULLET_PALETTE[hash % BULLET_PALETTE.length];
};

/**
 * Deduplicate a list of categories by their normalized display name, keeping
 * the first occurrence. Generic over any object exposing a `name` field.
 */
export const dedupeCategoriesByName = <T extends { name?: string | null }>(categories: T[]): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const cat of categories) {
    const key = formatCategoryName(cat.name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cat);
  }
  return result;
};
