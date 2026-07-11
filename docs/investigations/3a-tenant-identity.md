# §3a — Split Tenant Identity: `ministries` vs `ministry_groups`

**Status:** ✅ CONFIRMED against live DB (project `vpnpembyqbbaaiynfvli`, PG17) on
2026-07-11 via the Supabase Management API (the CLI crashes on this box, see
[phase0-findings-and-decisions.md](../phase0-findings-and-decisions.md)).
**Blocks:** Phase 4 (RLS gate). First item of the master plan's §9 first deliverable,
independent of the monorepo restructure.
**Extraction SQL:** [3a-tenant-identity-extraction.sql](3a-tenant-identity-extraction.sql)

---

## ★ CONFIRMED ANSWER — there is no split storage

**`ministries` is a VIEW**, not a table: `CREATE VIEW ministries AS SELECT … FROM
ministry_groups` (a plain single-table projection → auto-updatable, which is why
`subscriptionEnforcement.ts` can `UPDATE ministries SET subscription_status` and have it
write through). **All billing columns physically live on `ministry_groups`** —
`subscription_status`, `suspension_reason`, `subscription_plan_id`, `subscription_level`,
plus `slug`, `white_label_domain`, `verification_status`, `tax_id`, `legal_name`,
`platform_notes`, `risk_level`, etc.

- **Canonical tenant record = `ministry_groups`. Confirmed, not provisional.** `ministries`
  is just an alias view of the same rows/ids — a 1:1 projection that can never have orphans.
- The master plan's **#2 top risk ("split tenant identity") is substantially retired**: the
  two names are one table. Remaining work is RLS correctness, not data reconciliation.
- **Phase 6 new columns** (`subdomain`, `custom_domain`, `domain_status`,
  `features`/`modules`, `content_mode`) → add to **`ministry_groups`**. Note `slug` and
  `white_label_domain` already exist there — reuse/rename rather than duplicate.

### ⚠ Two Phase-4 red flags found while confirming (elevate these)
1. **`ministry_groups` SELECT is wide open.** Policy `ministry_groups_select_all` has
   `USING (true)` for role `public`, and Postgres ORs permissive policies together — so it
   overrides the narrower `ministry_groups_select_v2`/`public_ministries`. **Every
   authenticated (and anon) user can read every ministry's billing/PII columns**
   (`tax_id`, `legal_name`, `contact_email`, `platform_notes`, `risk_level`,
   `subscription_status`). For a multi-tenant SaaS this is a cross-tenant leak — **drop
   `ministry_groups_select_all` in Phase 4** and split public-safe vs owner-only columns.
2. **The `ministries` view can bypass RLS.** `reloptions = null` → `security_invoker` is
   **off** (PG default), so the view executes with its **owner's** privileges, not the
   caller's — reads through `ministries` do not enforce `ministry_groups` RLS. Currently
   masked because #1 leaves SELECT open anyway, but once #1 is fixed this view becomes the
   bypass. **Set `security_invoker = on` on the view** (or drop the view and point the ~3
   client reads at `ministry_groups`).

### Secondary split found: TWO membership tables (Phase 3/5)
- **`ministry_group_members`** — the one the app actually uses everywhere (has `group_id`
  *and* `ministry_id`, both non-null-consistent — 0 mismatches in prod; plus `push_token`,
  `email`, `can_receive_broadcasts`, `phone_number`). RLS keys admin off the **global**
  `user_profiles.role` (NOT tenant-scoped) and lets any user self-insert into any ministry.
- **`ministry_members`** — a separate, lighter table (`member_role`, `status`,
  `inbox_access`) with **properly tenant-scoped** RLS via `is_ministry_admin(ministry_id,
  uid)` / `is_ministry_member(ministry_id, uid)` helper functions.
- **Decision needed (Phase 3):** pick one canonical membership table. The app relies on
  `ministry_group_members` but `ministry_members` has the better RLS shape. Reconcile before
  the Phase 4 audit. Prod is tiny (2 groups / 9 `mgm` / 5 `mm` rows) so migration is cheap now.

---

## Why this matters
A tenant's rows are split across two tables that share one id. Until we know the exact
relationship, the three-boundary RLS audit (product + tenant + content-source) cannot be
proven correct — a policy written against the wrong table leaks. Neither table is defined
in the repo migrations (both dashboard-created), so the repo alone can't answer it.

## What the code proves (high confidence, no DB needed)

1. **Two faces, one id, used interchangeably.** [MinistryMembersManager.tsx:280-297](../../src/components/ministry/MinistryMembersManager.tsx#L280-L297)
   reads the **same `ministryId`** from `ministry_groups` (owner/leader — comment calls it
   "the canonical table") *and* from `ministries` (name). The app assumes
   `ministries.id === ministry_groups.id`.

2. **Creation writes only `ministry_groups`.** [MinistriesHub.tsx:285-321](../../src/components/MinistriesHub.tsx#L285-L321)
   inserts a `ministry_groups` row and then a `ministry_group_members` row — it **never
   inserts into `ministries`**. So a matching `ministries` row must be produced
   server-side (a trigger mirroring the insert, or `ministries` being a view). **This is
   the single unknown the SQL resolves** (blocks 1, 4, 5).

3. **Membership carries both ids, set equal.** The same insert writes
   `ministry_id: data.id` **and** `group_id: data.id` — a compatibility shim so queries
   keying on either column resolve. `ministry_group_members.group_id` is the membership
   key everywhere ([tenantMiddleware.ts:47-60](../../src/lib/middleware/tenantMiddleware.ts#L47-L60)).

4. **Clear division of ownership by face:**
   - `ministries` → **billing / lifecycle**: `subscription_status`, `suspension_reason`,
     `owner_id`, `name`, `banner`, `status='approved'`. Written by
     [subscriptionEnforcement.ts](../../src/lib/subscriptionEnforcement.ts) (`lockMinistryFeatures`,
     `unlockMinistryFeatures`) and read for the platform-admin ministry list.
   - `ministry_groups` → **membership / roles / branding / settings**: `owner_id`,
     `leader_id`, `logo_url`, `theme_color`, `invite_code`, `kiosk_pin`, `join_method`,
     `member_count`, `is_active`, `settings`. Every ministry-console surface keys off it.
   - Sibling tables (`ministry_subscriptions`, `ministry_usage_metrics`) key off the same
     `ministry_id` for billing/usage.

## Known bug to fix in Phase 3 (surfaced here)
`tenantMiddleware.getTenantContext` uses `.single()` on the membership lookup
([tenantMiddleware.ts:47-51](../../src/lib/middleware/tenantMiddleware.ts#L47-L51)) — this
**throws for any member of >1 ministry**, contradicting the plan's multi-membership
requirement. Phase 3's `CurrentMinistryProvider` must replace this with a list + a
current-ministry selection, not a single-row assumption.

## Open questions — now ANSWERED from the live DB
| # | Question | Answer |
|---|---|---|
| Q1 | Is `ministries` a table or a view? | **VIEW** — `SELECT … FROM ministry_groups` (auto-updatable). |
| Q2 | What trigger mirrors inserts? | **None needed** — it's a view; no mirroring/sync exists. |
| Q3 | FK binding the two ids? | **N/A** — one physical table; the view shares its id inherently. |
| Q4 | Do the id sets coincide? | **Always** — a view can't have orphans. Moot. |
| Q5 | Is `ministry_id` ever `!= group_id` in membership? | **No** — 0 mismatches, 0 nulls in prod (`ministry_group_members`). |
| Q6 | Column lists for Phase 6 placement | Captured — billing/branding/`slug`/`white_label_domain` all on `ministry_groups`. |
| Q7 | Current RLS starting point | Captured — see the two red flags above + membership policies. |

## Confirmed decisions
- **Canonical tenant record = `ministry_groups`.** `ministries` = a read/write view alias.
- **Phase 4 must:** (a) drop `ministry_groups_select_all` and split public-safe vs
  owner-only columns; (b) set `security_invoker = on` on the `ministries` view; (c) add the
  **product marker** (Ministry vs ReKindle) — absent from every current policy; (d) replace
  `ministry_group_members`'s global-role admin check with tenant-scoped checks (the
  `is_ministry_admin(ministry_id, uid)` pattern already used by `ministry_members`).
- **Phase 3 must:** pick the canonical membership table (`ministry_group_members` vs
  `ministry_members`) and fix `getTenantContext`'s `.single()` multi-membership bug.
- **Phase 6:** new tenant columns land on `ministry_groups`; reuse existing `slug` /
  `white_label_domain`.

## §3a is CLOSED. Unblocks the Phase 4 audit. Next: Phase 1 extraction map, then Phase 0 shell.
