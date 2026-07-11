# Phase 4 — RLS audit (findings + fix plan)

**Status:** ✅ **APPLIED + VERIFIED on the live DB** (project `vpnpembyqbbaaiynfvli`,
2026-07-12) via the Management API. Post-apply checks all green:
- 13 previously-open tables now have RLS on; `ministry_groups_select_all` dropped;
  `ministries` view `security_invoker=on`; `is_group_member/admin` created.
- Predicate validation (real fixtures): `is_group_member(A, memberOfA)=true`,
  `(B, memberOfA)=false`; `is_group_admin` false for a plain member, true for a
  leader/admin → **real members are not locked out; cross-tenant is denied.**
- Deny path proven on a populated table (`ministry_devotionals_backup`: privileged
  sees 1 row, member sees 0). Discovery + own-membership reads still work (app intact).

Isolation suite: [phase4-rls-tests.sql](phase4-rls-tests.sql) (fixtures: A=OPEN HEAVENS
`9a91551a…`, B=Rekindle Digital Mission `d5c5f57e…`, member `65c40622…`).

## The three boundaries (plan §3)
1. **Product** — Ministry vs ReKindle accounts. **No marker exists** (`user_profiles`
   has no `app_context`/`product`/`origin`). Deferred: we chose to keep rekindle's
   ministry for now, so there is one shared user base. Revisit when rekindle sheds
   ministry. *(Not addressed in this migration.)*
2. **Tenant** — every `ministry_id` row scoped to its ministry. **This is where the
   active leaks are.**
3. **Content-source** — global vs ministry-owned (see
   [content-source-model.md](content-source-model.md)); enforced per source pattern.

## 🔴 Critical — 13 tenant tables with RLS OFF (any authed user reads/writes ALL ministries)
`member_import_history`, `ministry_admin_access`, `ministry_analytics`,
`ministry_api_usage`, `ministry_devotional_progress`, `ministry_devotionals_backup`,
`ministry_donation_campaigns`, `ministry_flagged_content`, `ministry_invitations`,
`ministry_prayer_library_backup`, `ministry_storage_usage`, `platform_fees`,
`prayer_campaigns`.

Worst offenders: `ministry_admin_access` (who-can-admin grants), `ministry_invitations`
(join tokens), `ministry_donation_campaigns`, and the two `*_backup` content tables.
Fixed in the migration → RLS on + policies, by category:
- **member-facing** (invitations, donation_campaigns, flagged_content, import_history,
  prayer_campaigns): read = `is_ministry_member`, write = `is_ministry_admin`.
- **admin-only** (`ministry_admin_access`): all ops = `is_ministry_admin`.
- **personal** (`ministry_devotional_progress`): `user_id = auth.uid()`.
- **platform/internal + backups** (analytics, api_usage, storage_usage, platform_fees,
  *_backup): RLS on, **no member policy** → service_role/platform-admin only.

## 🔴 The two §3a leaks (still present)
- `ministry_groups_select_all` = `USING (true)` for `public` — ORs with the stricter
  policies → **every authed/anon user reads every ministry's billing + PII**
  (`tax_id`, `legal_name`, `contact_email`, `risk_level`, `subscription_status`).
  Migration **drops it**; select falls to `ministry_groups_select_v2` (public+active OR
  owner/leader). ⚠ RLS is row-level, so public+active ministries still expose ALL
  columns — a **discovery view** exposing only public-safe columns (name/logo/handle)
  + revoking broad base-table SELECT is a **follow-up** (bigger change; flagged, not in
  this migration).
- `ministries` view `security_invoker` is **off** (`reloptions = null`) → the billing
  view runs as its owner and can bypass `ministry_groups` RLS. Migration sets
  `security_invoker = on`.

## 🟠 2 tables: RLS ON, ZERO policies (deny-all — likely a functionality break, not a leak)
`ministry_roles`, `translation_queue`. Left alone in the migration (need to confirm how
the app reads them — probably via service_role edge functions). Flagged for review.

## 🔴 Helper-mismatch landmine (resolved in the migration)
The existing `is_ministry_member/admin(ministry_id, uid)` helpers query the
**`ministry_members`** table — but the app's canonical membership is
**`ministry_group_members`** (+ `ministry_groups.owner_id/leader_id`), a *different*
population (§3a: 9 vs 5 rows). **Writing RLS against the `is_ministry_*` helpers would
deny real app members.** The migration therefore defines its own
`is_group_member/is_group_admin` predicates keyed on `ministry_group_members` + owner/
leader, and uses those. (Reconciling the two membership tables remains a Phase-3 task.)

## Dependencies / caveats
- `service_role` bypasses RLS in Supabase, so edge-function/admin paths keep working.
- Apply in a low-traffic window; watch for `42501` (RLS denial) errors in the app.
- Still verify on a dedicated test member (run `phase4-rls-tests.sql`) before trusting it.

## Deliverables
- Migration: [../../supabase/migrations/0150_rls_hardening_phase4.sql](../../supabase/migrations/0150_rls_hardening_phase4.sql)
- Isolation tests: [phase4-rls-tests.sql](phase4-rls-tests.sql)

## Still open in Phase 4 (beyond this migration)
- Product-boundary marker (when rekindle sheds ministry).
- Public-safe **discovery view** for `ministry_groups` (column-level PII split).
- Audit the *content* tables' existing policies for the content-source boundary
  (global readable to all; `ministry_id`/`ministry_*` tenant-scoped; streams).
- LiveKit room/token tenant-scoping + `livekit_recordings` tenant dimension (§3b).
- Ministry-messaging audience must resolve to a tenant-scoped id list, never `null`
  (§3c) — the `send-push-notification` cross-tenant-blast risk.
