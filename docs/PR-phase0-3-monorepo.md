# Monorepo extraction + standalone Ministry app (Phase 0 → Phase 3)

Non-breaking, incremental restructure of ReKindle into a Turborepo/npm-workspaces
monorepo, extraction of six shared packages, a standalone Ministry app, and the
multi-tenant foundation. **`main` behavior is unchanged** — every commit is
build-green with the rekindle bundle byte-identical, and consumers were re-wired
via facade shims (old `@/…` paths re-export the packages).

## What's here (each bullet ≈ one reviewable commit)

**Phase 0 — monorepo shell**
- npm workspaces + Turborepo; the app moved unchanged into `apps/rekindle/`; empty
  `apps/ministry/` + `packages/`; `.gitattributes` (LF). `apps/rekindle` builds/runs
  identically.

**Phase 1 — shared package extraction** (dependency order)
- `@rekindle/types`, `@rekindle/supabase` (client), `@rekindle/auth` (entitlements/
  subscription/tenant), `@rekindle/live` (LiveKit + legacy Mux/Daily), `@rekindle/ui`
  (shadcn design system), `@rekindle/features` (content engine: i18n/TTS/prayer/
  devotional/offline/referrals + AuthContext/LanguageContext + hooks).
- Fix: Tailwind `content` now scans `packages/*` (a CSS-purge regression caught and
  reverted — CSS byte-identical again).

**Phase 2 — standalone Ministry app**
- `apps/ministry` thin shell → then extracted the shared closure needed by
  `MinistrySpace`: 22 live UI components → `@rekindle/live`, 8 shared feature
  components → `@rekindle/features`, and the **36-component ministry suite + 11
  giftAid libs → new `@rekindle/ministry`** (consumed by *both* apps; rekindle keeps
  its ministry features via shims).
- Ministry app now has routing + an auth gate (sign-in/up/reset) and renders the real
  `MinistriesHub`. Fixed a latent package-purity bug (`videoBackend` dynamic `@/`
  import) that the ministry app exposed.

**Phase 3 — multi-tenant foundation**
- Fixed the multi-membership `.single()` bug; `getUserMinistries()` returns the full
  list (keyed on the canonical `ministry_groups`, per docs/investigations/§3a).
- `CurrentMinistryProvider` (current-ministry context, persisted, single-membership
  fast path) + `MinistrySwitcher`.
- Per-ministry feature flags (`MINISTRY_MODULES` + `useModuleEnabled`).

## Not in scope / follow-ups
- Deferred UI components (rekindle-only) stay put; dead Deno source
  (`lib/functions/*`, `daily-recordings`, `onboarding-tips-function`,
  `schemaValidator`) left for a cleanup pass; `utils.ts` grab-bag split.
- The rekindle-sheds-ministry cut is intentionally deferred (ministry is shared for now).
- Phase 3 step 4 (content-source model + devotional-stream reconciliation) and
  Phase 4 (RLS gate — see the two red flags in docs/investigations/3a-tenant-identity.md)
  are the next work.

## Verification
`npm run build` builds both apps green (turbo); ministry dev serves 200 on :8081,
rekindle on :8080. Two Phase-4 RLS red flags and the §3a tenant-identity findings are
documented under `docs/investigations/`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
