// Foundational language type. Canonical home for the supported-language union.
// `@/lib/i18n` re-exports this so existing `import { SupportedLanguage } from '@/lib/i18n'`
// call sites keep working while the type itself lives in the shared types package.

export type SupportedLanguage =
  | 'zh' | 'ja' | 'ko' | 'vi' | 'th' | 'id' | 'hi' | 'ar' | 'bn' | 'ta' | 'te'
  | 'ur' | 'fa' | 'he' | 'my' | 'km' | 'lo' | 'ne' | 'si' | 'tl' | 'ms'
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ru' | 'it' | 'nl' | 'pl' | 'tr'
  | 'sw' | 'yo';
