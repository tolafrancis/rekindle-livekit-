# Ministry billing / tier enforcement audit

**Status:** Diagnostic audit performed 2026-08-30. **All 8 fix-order items are now
implemented** (see "Recommended fix order" below for exactly what shipped and what's
still deferred within items 2, 3, and 6 — those deferrals are real, deliberate
scope cuts, not oversights, each with its own stated reason). Every item required
either a manual Supabase Dashboard step (a migration paste, a redeploy, a `pg_cron`
schedule) that this session cannot perform directly — see each item below for
exactly which action is still outstanding on the user's side.

**Bottom line:** subscription-tier enforcement is almost entirely cosmetic. Payment
collection and status tracking work end-to-end (Stripe/Paystack checkout → webhook →
`ministry_subscriptions` row). Almost nothing downstream actually checks that row
before letting a ministry use a feature. A Starter-tier admin can use the Ministry
CRM, invite unlimited members, and generally do everything a Ministry Plus admin can
— the plan only changes which recording/broadcast **minutes** get cut off, and even
that has gaps.

## 🔴 Root cause: three disconnected entitlement systems, wrong one wired to most UI

1. **`ministry_subscriptions.plan_type`/`.status`** — the real table the Stripe/
   Paystack webhook writes to (`starter`/`growth_partner`/`ministry_partner`/
   `ministry_plus`). This is what *should* be authoritative for a ministry's plan.
   Resolved via `packages/auth/src/ministryEntitlements.ts` (`getMinistryEntitlements`),
   `PLAN_RANK` at line 83.
2. **`user_profiles.subscription_tier`** — the *individual user's own* personal tier
   column. This is what most ministry-feature gates actually read
   (`packages/auth/src/useUserEntitlements.ts:129`, `MinistriesHub.tsx:168`,
   `MinistryDevotionalCreator.tsx:91`, `liveChannelAnalyticsService.ts`), checking
   for values like `'ministry'`/`'ministry_plus'`. Those two `subscription_tiers`
   rows were explicitly **deactivated** in
   `supabase/migrations/0271_deactivate_dead_ministry_subscription_tiers.sql:15-17`,
   and the real Ministry Partner checkout flow (system 1) never writes to
   `user_profiles.subscription_tier` at all — this gate checks a column the current
   billing system doesn't touch.
3. **`ministry_group_members.subscription_level`** — hardcoded to `0` on every member
   row (`packages/ministry/src/components/MinistryMembersManager.tsx:326`), never
   written otherwise. Unused placeholder.

However a ministry actually pays (system 1), the gates sprinkled through the UI
mostly check system 2, which that payment never touches — tier gating isn't just
leaky, it's **structurally disconnected** from real billing in most places it exists
at all.

## 🔴 "Ministry CRM" is not gated at all

Starter's plan row literally lists `"No Ministry CRM"`
(`supabase/migrations/0258_ministry_tier_rebrand.sql:41`); Growth Partner lists
`"Full Ministry CRM suite"` (line 51). But:

- No component/route named "CRM" exists — it's marketing language for the existing
  Members/Volunteers/Evangelism-Inbox screens.
- `packages/ministry/src/components/MinistryManagement.tsx`'s tab list (`TABS`,
  lines 61-79, including `members`, `volunteers`, `inbox`) is a static array. Access
  to the whole shell is gated only by `checkLeaderStatus()` → `isLeader` (membership
  role, lines 92/126) — **no tier check anywhere in that file.**
- `EvangelismInbox.tsx` (the Inbox/CRM component) has zero tier/subscription/
  entitlement/lock/upgrade references — renders and queries real data unconditionally.
- Its backend call, `supabase/functions/evangelism-send-message/index.ts`, has no
  tier check **and no auth check at all** — trusts whatever `ministryId` is in the
  raw POST body. *(Flagging this as a standalone security bug, not just a billing
  gap — anyone can trigger it for any ministry ID regardless of plan.)*

**Verdict:** subscribing to Starter does nothing technical today. Every ministry, on
every plan (including no plan), has full CRM/Members/Volunteers/Inbox access.

## 🔴 Limits computed and stored, never enforced

| Limit | Column | Enforcement found |
|---|---|---|
| Member count | `ministry_subscriptions.member_limit` | **None.** `enforceMemberLimit()` exists (`packages/auth/src/subscriptionEnforcement.ts:1256`) but has zero callers anywhere outside its own file. |
| Storage (general) | `storage_limit_mb` | Only enforced at HLS/recording egress start (see 🟢 below) — no check anywhere else, e.g. before a regular file upload. |
| Meeting hours | `meeting_hours_limit` | **None.** Never read outside the webhook write / its own type definition. |
| Broadcast hours (outside egress) | `broadcast_hours_limit` | Same — no consumer of this value anywhere except the two egress-gating Edge Functions. |
| Module/feature toggles by tier (broadcasts/live/branding/analytics) | `packages/features/src/ministryModules.ts`'s `MODULE_TIER_CAP` | Correctly designed (`resolveModulesForTier()`, `useEntitledModules()`/`useCanUse()` in `packages/features/src/useMinistryEntitlements.ts`) but **called nowhere in the app** — confirmed by grep, zero call sites outside their own definition files. The hooks actually used everywhere (`useModuleEnabled`/`useMinistryModules`) call the non-tier `resolveModules()`, which only applies a tenant's own manual toggle. |

## 🟢 What IS actually enforced (the whole list)

- **Storage full** and **broadcast hours exhausted** block starting a recording/HLS
  egress with a 403 — `supabase/functions/livekit-egress/index.ts:249-250,309-311`
  and `supabase/functions/livekit-webhook/index.ts:84`, via
  `get_ministry_storage_status()`/`get_ministry_hours_status()` RPCs
  (`supabase/migrations/0263_ministry_enforcement_status_fns.sql:23-116`,
  `service_role`-only).
- `canHostInteractiveMeeting`/`canRecordMeetings` disable a "Start Meeting" button
  client-side (`LiveChannelInteractiveMeetings.tsx:766-767,1117`,
  `MinistryInteractiveMeetings.tsx:887,1439`) — real UI blocking, but **no
  server-side backing** (no Edge Function/RLS re-check), and it queries the wrong,
  partially-deactivated legacy individual-tier system (`getUserActiveSubscription`
  in `subscriptionEnforcement.ts`), not the ministry's actual `ministry_subscriptions`
  plan.

That is the entire list of anything resembling real enforcement in the app today.

## 🔴 No tier-aware RLS anywhere

Grepped every `create policy` across all tracked migrations for any reference to
`subscription_tier`/`subscription_status`/`subscription_level`. **Zero matches.**
Every ministry-scoped RLS policy (`is_group_member`/`is_group_admin`,
`supabase/migrations/0150_rls_hardening_phase4.sql:24-48`) checks membership/role
only — never plan. `livekit-token/index.ts` (mints the join token for every meeting
— the gate that actually matters for "can I even start a session") has no tier
check at all.

## 🟠 Confirmed bugs found along the way (not fixed)

- **`MinistrySpace.tsx:299-300`** reads `entitlements.can_customize_dashboard` and
  `entitlements.can_use_ministry_branding` off `useUserEntitlements()`. Verified:
  **neither property exists on that hook's `UserEntitlements` interface**
  (`packages/auth/src/useUserEntitlements.ts:28-71`) — they belong to an unrelated
  `SubscriptionTier` type in `subscriptionEnforcement.ts`. Both are always
  `undefined` at runtime; never caught because `vite build` doesn't run a separate
  `tsc --noEmit` step.
- **Historical (fixed, but a warning):**
  `supabase/migrations/0270_ministry_subscriptions_plan_type_fix.sql`'s own header
  comment documents that a stale CHECK constraint made **every** Ministry Partner
  webhook write silently fail, so every paying ministry resolved to Free
  entitlements until that migration shipped. There's still no periodic job
  reconciling `current_period_end` against `now()` — a future missed/delayed
  webhook would leave a lapsed ministry's `status` stuck at whatever it last was,
  indefinitely.
- **Duplicate Edge Function layout**: `supabase/functions/*` (real, deployed) vs. a
  legacy flat `supabase/<name>/index.sql` tree with overlapping donation/subscription
  functions of unconfirmed live status — already flagged in
  `docs/production-secrets-and-infra-todo.md:8-13,157`, re-confirmed here.

## Recommended fix order

1. ✅ **Done** — `evangelism-send-message` now requires `is_group_admin(ministryId)`
   and re-derives the contact's channel/target server-side instead of trusting the
   client body. Still needs a manual redeploy in the Supabase Dashboard (legacy flat
   layout, not auto-deployed).
2. ✅ **Done, with deferrals** — `MinistrySpace.tsx` (Manage Ministry access, team
   management, branding, white-label), `MinistryInteractiveMeetings.tsx` (both call
   sites), and `LiveChannelInteractiveMeetings.tsx` (ministry-owned-channel branch
   only) now resolve via `getMinistryEntitlements(ministryId)` instead of the
   individual `user_profiles.subscription_tier`/legacy `subscriptionEnforcement.ts`
   path. `MinistriesHub.tsx`'s dead stale-slug clause removed (behavior-neutral).
   **Explicit product decision**: baseline "Manage Ministry" access now requires an
   *active paid* `ministry_subscriptions` row, not just any leader — real behavior
   change, blast radius on currently-active ministries not verified from this
   session (see the SQL query that was in this doc's risk callout, now resolved into
   this fix's commit message). **Deferred within this item** (each has its own
   separate pre-existing bug independent of tier gating, so bundling a swap in would
   ship an unverified fix on top of already-broken code):
   - `MinistryDevotionalCreator.tsx` (both copies) — no ministry-context plumbing at
     all today.
   - `liveChannelAnalyticsService.ts`'s `checkAnalyticsPermissions` — queries
     deprecated `ministry_members`/`profiles` tables, not the real
     `ministry_group_members`/`user_profiles`.
   - `packages/ui/src/utils.ts`'s `handleSubscriptionUpgrade` — confirmed dead code,
     zero callers anywhere.
   - `AppLayout.tsx` nav-visibility flags, `AdminMinistryGroups.tsx`/
     `MinistryGroupsManager.tsx` platform-admin filters — nav/tooling, not access
     control, lower priority.
3. ✅ **Done, rescoped** — the originally-suggested "already-written machinery"
   (`checkLimit`/`enforce*Limit`, `resolveModulesForTier`/`useEntitledModules`)
   turned out unsafe to reuse as-is: `checkLimit`'s `.single()` throws for any
   ministry with no subscription row (contradicts fix 2's Free-fallback design),
   and it depends on a `ministry_usage_metrics` table nothing populates anywhere.
   Built fresh instead, directly on `getMinistryEntitlements()`:
   - Member-count limit enforced at both places that create a
     `ministry_group_members` row (`MinistryMemberRegistration.tsx`'s self-service
     join, `MinistryRegistrations.tsx`'s admin-approval promotion).
   - `MinistrySpace.tsx`'s Live/Broadcast nav entries now hidden unless the
     ministry's plan grants `caps.liveChannels`/`caps.broadcastMessaging`.
   - **Still deferred** (real, separate scope): storage/meeting-hours/
     broadcast-hours enforcement — needs new usage-tracking wired across many
     mutation points (file uploads, LiveKit session duration) that don't exist
     anywhere today, not just one check. Branding/analytics nav gating — neither
     has one confirmed, unambiguous nav entry point yet (branding lives in
     `MinistrySettingsManager.tsx`'s fields; analytics has no confirmed UI
     location).
4. ✅ **Done, rescoped** — "Ministry CRM" turned out to have a precise spec
   already written: `useUpgradePrompt.ts`'s `ministry_inbox_gate` copy says it's
   specifically the Evangelism Inbox's Messenger/Instagram/website-chat channels
   (Growth Partner+), with WhatsApp explicitly called out as available on every
   plan. Not a whole tab to hide — a Starter ministry still needs the Inbox tab
   for WhatsApp. New `MinistryCaps.crmChannels` cap (same `rank >= 2` threshold
   as `manageTeam`/`recordMeetings`); `EvangelismChannelsPanel.tsx`'s Messenger &
   Instagram and Website widget cards now show a locked/upgrade notice instead
   of their connect UI when the plan lacks it; `EvangelismInbox.tsx`'s channel
   filter hides those channels too. Members/Volunteers management left
   untouched — no product-copy evidence anywhere that those are plan-gated.
5. ✅ **Done** (as part of #2) — `MinistrySpace.tsx`'s broken
   `entitlements.can_customize_dashboard`/`can_use_ministry_branding` property read
   removed; branding/white-label now come from `ministryEntitlements.caps` instead.
6. ✅ **Done, rescoped** — everything shipped in fixes 2-4 was client-side only.
   Narrowed to the two targets safely enforceable against a *confirmed* schema
   (not a guess): a `before insert` trigger on `ministry_group_members`
   (`supabase/migrations/0297_ministry_limit_enforcement.sql`) mirroring fix 3's
   member-count check exactly, `security definer` so it reads
   `ministry_subscriptions` regardless of the inserting user's own RLS grants; and
   a plan check added to `evangelism-save-channel/index.ts` (the one real
   Messenger/Instagram save path — WhatsApp and the website widget don't go
   through it), same `rank >= 2` threshold as fix 4's `crmChannels` cap. **Still
   deferred, each for a concrete reason**: interactive meetings/live channels
   (Starter's own plan copy includes this, so the real gate is just "any active
   plan," and the underlying `ministry_video_meetings` table's full schema is less
   confirmed than `ministry_group_members`'s); `recordMeetings` (already has real
   quota-based enforcement via `livekit-egress`/`livekit-webhook` — a separate
   rank check would be a new, unbacked restriction); broadcast messaging (backend
   path not yet confirmed); the website-chat inbound webhook accepting messages
   regardless of plan (a materially bigger surface — webhook auth/validation, not
   a check inside an existing authenticated action).
7. ✅ **Done** — cross-referenced every function name in both layouts: only 6 actually
   collided (`livekit-egress`, `livekit-ingress`, `livekit-moderation`,
   `livekit-token`, `livekit-webhook`, `send-email-broadcast`; everything else in
   either tree is unique to that layout, so there was no real ambiguity there).
   Diffed all 6 — 4 identical, 2 diverged with `supabase/functions/` clearly newer
   in both (a dated bug fix `livekit-webhook`'s flat twin lacked; `livekit-ingress`'s
   flat twin predates the `ingress_stream_key` column). Deleted all 6 flat-layout
   duplicates, updated the docs that linked the old paths. **Action needed**:
   redeploy `livekit-webhook` and `livekit-ingress` from `supabase/functions/` if
   they haven't been recently — production may still be serving the stale code.
   Full detail in `docs/production-secrets-and-infra-todo.md`'s "two layouts" note.
8. ✅ **Done** — deliberately not calling out to Stripe/Paystack's API to verify
   (real added complexity — per-provider credentials, rate limiting — for a
   narrower problem than it solves). Instead a conservative, self-healing daily
   sweep: `public.reconcile_ministry_subscriptions()`
   (`supabase/migrations/0298_reconcile_ministry_subscriptions.sql`) demotes any
   `active` subscription whose `current_period_end` is more than 3 days past to
   `past_due` — the same state a real `invoice.payment_failed` webhook already
   sets, so it's correctly excluded from `ACTIVE_STATES` but not `cancelled`;
   fully self-healing once a delayed-but-real webhook eventually arrives and
   overwrites it back. Every demotion gets a `ministry_audit_logs` row. No new
   edge function needed — pure SQL, scheduled directly via `pg_cron` (unlike
   every other job in `docs/edge-functions-and-cron.md`, none of which touch
   external providers). **Action needed**: paste the migration, confirm
   `pg_cron` is enabled, test the function by hand once, then run its scheduling
   block — full step-by-step in `docs/edge-functions-and-cron.md`'s new PENDING
   section.

## Summary of what still needs manual action on your side

None of this session's fixes could be applied to the live system directly (no
working Supabase CLI/access token this whole project — migrations and Edge
Function deploys are pasted by hand in the Dashboard, confirmed in
`supabase/config.toml`). Outstanding:
- Paste migrations `0295`–`0298` (translation services RLS, Ministry Rules,
  member-limit trigger, subscription reconciliation) if not already done.
- Redeploy `evangelism-send-message` and `evangelism-save-channel` (fixes 1 and 6).
- Redeploy `livekit-webhook` and `livekit-ingress` if not done recently (fix 7) —
  production may be serving stale code until this happens.
- Confirm `pg_cron` is enabled, then run fix 8's scheduling block.
