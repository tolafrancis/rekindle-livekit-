# Master Build Plan — Ministry as a Standalone Multi-Tenant SaaS

**Status:** Plan only. No code is written until explicitly approved.
**Codebase:** ReKindle BC — React 18 + TypeScript + Vite + Supabase.
**Live streaming:** **self-hosted LiveKit** (SFU + Egress + Ingress on a Hostinger VPS),
built and deployed behind the `VITE_VIDEO_BACKEND` flag. Daily/Mux is the legacy path,
still present but being retired. TTS via `generate-tts-audio` + `tts_audio_cache`.

> **Revision note (this pass):** updated to reflect work landed since the first draft —
> the LiveKit migration, devotional streams (`0149`), AI meeting notes, and the discovery
> that tenant identity is split across two tables with tenant/billing middleware already
> partly built. Changes are flagged inline with **[REV]**.

---

## 1. Product summary (all decisions confirmed)

Extract Ministry from ReKindle into a **standalone product sold to churches**,
white-labelled, without disrupting the existing ReKindle consumer app.

| Decision | Choice |
|---|---|
| Product relationship | **Separate product, separate accounts** from ReKindle |
| App model | **One app**, multi-tenant — many ministries + their members sign into the same app |
| Membership | A member can belong to **multiple ministries** — **ministry switcher** + "current ministry" context |
| Backend | **Shared Supabase project**, isolated by **product** (Ministry ≠ ReKindle) *and* **tenant** (church A ≠ B) via RLS |
| Repo | **Monorepo** — Ministry is its own **app inside the monorepo** |
| Extraction | **Extract shared packages first, in place**, before any app split |
| Member entry | Member signs in → lands in **their ministry space**; a thin **personal profile layer** sits alongside |
| ReKindle entry | Sign up via ReKindle directly → **straight into the main app, no ministry affiliation** |
| Content ownership | **Both** — your global library **+** the church's own content, blended per church |
| **Live backend [REV]** | **Self-hosted LiveKit** (built). Extracted into the monorepo like any other shared code. Not Daily/Mux. |
| Hosting | **Cloudflare Pages** (frontend) + **Supabase** (backend) + **LiveKit VPS** (live) **[REV]**; native member app via **Capacitor** later |
| Domains | **Subdomains free for all** (wildcard); **custom domains** as a paid tier via **Cloudflare for SaaS** |
| **Devotional streams [REV]** | **Global catalog** — ReKindle authors streams + runs the scrape/AI ingestion crons; churches **select** a public stream to display. Churches consume, don't author streams. |

### Content bundle (launch scope, white-labelled, global + church-own)
- **Devotionals** — incl. the new **stream** model (global catalog; a church points its
  homepage at a stream, else writes its own). See `0149_devotional_streams.sql` and
  `docs/devotional-stream-automation-plan.md`.
- **Prayer — the ENTIRE module** (library, `InteractivePrayerSession`, `PrayerSeriesViewer`,
  wall, journal, prayer points, history/analytics, bookmarks, audio-guided)
- **Affirmations + Declarations**
- **Home widgets** (daily devotional widget, dashboard surface)
- **Reading plans**
- **Audio / TTS** (existing `tts_audio_cache` pipeline)
- **Books** (Christian classics summaries + church-own)

### Ministry-native features
Member registration (QR / invite / kiosk), attendance/check-in, giving + Gift Aid,
**broadcasts/live (LiveKit) [REV]**, events, member directory, roles/leaders, analytics,
branding. **AI meeting notes [REV]** (distributed transcription + `meeting-ai` OpenAI proxy)
are available on ministry meetings.

---

## 2. Architecture overview

**Monorepo** (Turborepo + pnpm workspaces):

```
repo-root/
├─ apps/
│  ├─ rekindle/        # existing consumer app, unchanged (ReKindle-origin = no ministry)
│  └─ ministry/        # the standalone church product (this plan)
├─ packages/
│  ├─ types/           # shared TypeScript types
│  ├─ supabase/        # Supabase client, edge-fn invokers, query helpers
│  ├─ auth/            # auth/session/entitlements
│  ├─ live/  [REV]      # LiveKit wrapper (LiveKitRoomWrapper, videoBackend seam) + livekit-* invokers
│  ├─ ui/              # shared design-system components
│  └─ features/        # shared logic (kiosk claim, TTS player, i18n core, etc.)
└─ (turbo.json, pnpm-workspace.yaml, root package.json)
```

- **One shared Supabase project.** What a user sees is decided by **product**,
  **current ministry**, and **role** — never a separate system.
- **Ministry app** is a thin shell over shared packages, rendering only the ministry world.
- **Live (LiveKit) [REV]:** a **single self-hosted VPS** (SFU/Egress/Ingress/Redis/Caddy)
  shared across all tenants. The client seam is `videoBackend.ts` → `LiveKitRoomWrapper`;
  the control plane is five edge functions (`livekit-token/moderation/egress/ingress/webhook`).
  This whole surface extracts into `packages/live`. **The VPS is separate infra** the plan's
  hosting must account for (capacity, per-tenant recording storage, the pending CPU upgrade —
  room-composite Egress needs ~4 vCPU; see below).
- **Native member app** = the same Ministry member build, **Capacitor-wrapped**.
- **Hosting:** both apps on Cloudflare Pages; Supabase backend; LiveKit VPS for live.

---

## 3. Data & tenancy model — the three isolation boundaries

`ministry_groups` = the community/membership face of the tenant; **`ministries`** = the
**billing/subscription** face **[REV]** (see §3a). Members link via
`ministry_group_members` / `ministry_members` (multi-membership already supported).

Every read must satisfy **three** boundaries:

1. **Product boundary** — Ministry accounts vs ReKindle accounts must not see each other.
   Add a **product marker** (`app_context` on the account, or a Ministry-specific profile
   table) so RLS walls the two products apart within the shared project.
2. **Tenant boundary** — within Ministry, every ministry-scoped row filters by `ministry_id`.
   Church A can never read Church B.
3. **Content-source boundary** — bundled content is either **global** (yours, visible to all)
   or **ministry-owned** (`ministry_id`). A church sees *global + their own*, never another
   church's private content. **[REV] For devotionals this axis now also runs through
   `devotional_streams` / `ministry_devotional_settings` / `devotionals.stream_id` — the
   merged resolver and RLS must treat streams as the global-catalog mechanism.**

**Current-ministry context** — `CurrentMinistryProvider` holds "which ministry am I acting
in right now," persisted in session; every scoped query reads `ministry_id` from it.
**[REV] Partly exists:** `src/lib/middleware/tenantMiddleware.ts` already provides
`getTenantContext(userId)` with a platform-admin bypass. Phase 3 extends this into the
provider/switcher rather than building from zero.

**Content-source model** — each content type gets a source dimension: `NULL`/global
`ministry_id` = global; a set `ministry_id` = church-owned. The member's feed is a **merge**
of global + current-ministry content, with an optional per-ministry **"our content only"**
switch. **[REV] Devotionals additionally resolve by stream** (global catalog; a church may
point its homepage at a stream via `ministry_devotional_settings`).

**Personal profile layer** (belongs to the member, not the church console):
account/profile, giving history + receipts, check-in/attendance history, **prayer stats**,
**AI meeting notes/insights [REV]** (`meeting_ai_notes`, already `created_by`-scoped),
ministry switcher, leave/manage membership.

### 3a. [REV] The split tenant identity — investigate + reconcile before Phase 4
Tenant identity is spread across **two tables sharing one id**:

| table | role | key columns (observed) |
|---|---|---|
| `ministries` | **billing / subscription / suspension** | `id`, `name`, `banner`, `owner_id`, `subscription_status`, `suspension_reason` |
| `ministry_groups` | **membership / roles / branding** | `id`, `name`, `owner_id`, `leader_id`, `logo_url` |

Evidence: `subscriptionEnforcement.ts` updates `ministries.subscription_status`;
`MinistryManagement`/`MinistrySpace`/`ministry_devotionals`/`ministry_devotional_settings`
all key off `ministry_groups.id`; both are queried with the *same* `ministryId`. Neither is
defined in migrations (dashboard-created), so the exact relationship (shared PK? one a view?
kept in sync by a trigger?) is **unconfirmed**.

**Action (before Phase 4):** a short investigation task — dump both tables' columns and
constraints, confirm the id relationship, decide the canonical tenant record, and document
which face owns what (billing vs membership). The three-boundary RLS audit **cannot be
correct** until this is nailed down, because a tenant's rows are split across both.

### 3b. [REV] LiveKit tenancy — new gap the live pillar introduces
`livekit-token` derives a participant's role from **ReKindle-specific tables** (`meetings`,
`ministry_video_meetings`, `live_channel_video_meetings`, `counselling_sessions`). For a
sold product this must be **tenant-scoped**:
- **Room naming** must encode/segregate by `ministry_id` so two churches can't collide or
  join each other's rooms.
- **Token grants** must be derived from the tenant's meeting tables under the tenant
  boundary, not global ReKindle tables.
- **Recording storage** (`livekit_recordings`, Egress → S3/R2) needs a **tenant dimension**
  (currently none) and per-church playback isolation.
- **Capacity:** one shared VPS. Room-composite Egress is ~4 vCPU each — plan per-tenant
  concurrency limits and the VPS CPU upgrade before selling live+recording.

---

## 4. The build phases

**Guiding principle:** *Never break `main`.* Every step ends buildable and runnable.
`tsc` clean on every PR.

### Phase 0 — Monorepo shell (no code moves yet)
1. pnpm workspaces + Turborepo at root.
2. Move the current app unchanged into `apps/rekindle/`.
3. Add empty `apps/ministry/` and `packages/`.
4. **Checkpoint:** `apps/rekindle` builds and runs identically. Commit.

### Phase 1 — Extract shared packages (in place, one PR each, least-dependent first)
1. `packages/types`.
2. `packages/supabase` — client, edge-fn invokers, query helpers. **[REV] includes the
   `livekit-*` and `meeting-ai` invokers** (Mux `manage-stream-input` still present but
   legacy — do not build new work on it).
3. `packages/auth`.
4. **`packages/live` [REV]** — `videoBackend.ts` seam, `LiveKitRoomWrapper`, the
   normalized participant types, moderation/egress/ingress client helpers. The Daily
   wrapper stays behind the flag until the Phase 7 teardown of the LiveKit migration.
5. `packages/ui`.
6. `packages/features` — kiosk claim, TTS player + cache, i18n core, **AI-notes hook +
   distributed-transcription [REV]**.

For each: move files → package `package.json` → re-point `apps/rekindle` imports → checkpoint → commit.

### Phase 2 — Stand up the Ministry app (thin shell)
1. Scaffold `apps/ministry` consuming the shared packages.
2. Move ministry-only surfaces from `apps/rekindle`: ministry management, registration/kiosk,
   giving/Gift Aid, **broadcasts/live (LiveKit) [REV]**, ministry analytics, branding, and the
   bundled content surfaces (devotionals **incl. stream selection [REV]**, prayer module,
   affirmations, declarations, widgets, reading, audio, books).
3. Own routing/entry.
4. **Checkpoint:** both apps build and run independently.
**Milestone:** standalone Ministry app exists in the monorepo, independently deployable.

### Phase 3 — Multi-tenant layer + content sourcing + feature flags
1. **Tenant resolution** — extend the existing `tenantMiddleware.getTenantContext` **[REV]**;
   look up the member's ministries via `ministry_group_members`.
2. **`CurrentMinistryProvider`** — authoritative "current ministry" context.
3. **Ministry switcher** UI + single-ministry fast path.
4. **Content-source model** — tag all bundled content global vs ministry-owned; build the
   **merged resolver** (global + current ministry) with the "our content only" switch.
   **[REV] Reconcile with devotional streams:** streams are the global-catalog path for
   devotionals; a church's homepage resolves stream-first (`ministry_devotional_settings`)
   then its own, per the shipped `MinistrySpace` logic.
5. **Per-ministry feature flags** — a `features`/`modules` config on the tenant.
6. **Checkpoint:** a test member in two ministries switches and sees correct data + modules +
   merged content (incl. correct devotional stream).

### Phase 4 — RLS hardening (the make-or-break)
1. **[REV] Resolve §3a first** (the split tenant identity) — the audit depends on it.
2. Add the **product marker** so RLS separates Ministry from ReKindle.
3. Audit **every** ministry/member/content table for **all three** boundaries — including
   **tables landed this session [REV]**:
   `meeting_waiting_room`, `livekit_recordings`, `channel_streams`/`livekit_channel_streams`,
   `meeting_ai_notes`, `devotional_streams`, `ministry_devotional_settings`,
   `user_profiles.devotional_stream_id`. Notes:
   - `meeting_ai_notes` is `created_by`-scoped → personal layer; confirm it stays private.
   - `livekit_recordings` / `channel_streams` have **no tenant dimension yet** → add one.
   - `devotional_streams` is global; `ministry_devotional_settings` is tenant-scoped
     (owner/leader + admin writes) — verify both under the product boundary too.
4. **[REV] LiveKit room/token tenant-scoping** (§3b) is part of this gate for live.
5. Write **RLS test cases**: member of A can't read B; Ministry ≠ ReKindle; leader scope
   limited to own ministry; church sees global + own content only; member prayer/giving/
   **meeting-notes [REV]** history private to them; **church A can't join/record church B's
   LiveKit rooms [REV]**.
6. **Checkpoint:** isolation suite passes. **Non-negotiable gate.**

### Phase 5 — Sign-up / sign-in
1. **Separate Ministry accounts** via Supabase Auth.
2. Sign-up scoped to a ministry: QR / invite / kiosk + **join-by-code**.
3. **Find-or-create account → attach membership** (reuse kiosk claim), approval-aware,
   no duplicate accounts across ministries.
4. **Admin invite / CSV bulk import.**
5. ReKindle-origin signups continue into the main app with no ministry affiliation.
6. **Checkpoint:** join into a ministry; second-ministry join attaches, not duplicates.

### Phase 6 — Make it sellable (onboarding, billing, branding, domains)
**6a. Church self-onboarding** — sign up → create org → pick handle → invite leaders → import.
**6b. Billing [REV — partly exists]** — `ministries` already has `subscription_status`/
`suspension_reason` and `subscriptionEnforcement.ts` enforces usage limits. **Extend**, don't
rebuild: wrap tiers in signup → trial → subscription (Stripe), tie to the tenant, gate module
toggles + custom domain + white-label + **LiveKit live/recording usage [REV]** by tier.
**6c. Branding** — logo/name/colors per tenant; white-label reader, widgets, audio player.
**6d. Domains — two tiers, one hostname resolver** (hostname → ministry → current-ministry):
- **Tier 1 — Subdomain (free):** `church.yourproduct.com`, one wildcard + wildcard TLS.
- **Tier 2 — Custom domain (paid):** Cloudflare for SaaS custom hostnames.
**6e. Domain cost:** subdomains free; custom hostnames first 100 free, then $0.10/domain/mo.
**6f. Domain caveats:** use Cloudflare for SaaS (not Pages native, ~100 cap); apex/wildcard/
custom-cert are Enterprise-only → default churches to a subdomain of their own domain; build
a pending→verifying→live status UI.
**6g. Deploy** `apps/ministry` to Cloudflare Pages; **provision/scale the LiveKit VPS for
live+recording load (CPU upgrade) [REV]**; keep `apps/rekindle` where it is.
**New DB fields on the tenant:** `subdomain`, `custom_domain`, `domain_status`,
`features`/`modules`, `content_mode` (blended | own-only). **[REV] Decide which tenant table
(`ministries` vs `ministry_groups`) these live on as part of §3a.**

### Phase 7 — Native member app (optional, later)
Capacitor-wrap the Ministry member surface; push via FCM/OneSignal. Same build.

### Phase 7b — [REV] Retire the legacy video path
Independent of the SaaS work: once LiveKit is validated in production, complete the LiveKit
migration's own Phase 7 — remove `VITE_VIDEO_BACKEND`, delete `@daily-co/daily-js`, drop the
Mux edge functions/libs/secrets. Do this **before** shipping the ministry product so the
extracted `packages/live` carries only LiveKit.

---

## 5. Dependency spine (why this order)

Monorepo shell → extract shared code (**incl. `packages/live` [REV]**) → stand up Ministry
app → tenant + content + flags (**extend existing tenant middleware [REV]**) → **RLS gate
(now incl. LiveKit + this session's tables) [REV]** → sign-up → sell → native.
Phases 0–2 low-risk reorg. **Phase 4 is the highest-stakes gate.** Phases 5–6 the new work.

---

## 6. Top risks

- **RLS gaps (product + tenant + content-source)** — audit hardest; hard gate at Phase 4.
- **[REV] Split tenant identity (`ministries` vs `ministry_groups`)** — a tenant's rows live
  in two tables; get the canonical model + RLS right or isolation leaks. Investigate first.
- **[REV] LiveKit multi-tenancy** — room/token scoping keyed off ReKindle tables today;
  single shared VPS with no per-tenant recording isolation and a pending CPU upgrade.
- **Tenant-context leakage** — one clean "current ministry" abstraction (extend existing).
- **Duplicate accounts across ministries** — find-or-create-then-attach.
- **[REV] Content merge now spans two mechanisms** — `ministry_id` source tagging **and**
  devotional streams; the resolver + RLS must agree on both.
- **Code drift** — solved by the monorepo.

---

## 7. What's already built vs. new

**Have:** tenant model (`ministry_groups` + `ministries`); multi-membership; per-ministry RLS;
member content (devotionals **+ streams [REV]**, full prayer module, affirmations, declarations,
widgets, reading, audio + `tts_audio_cache`, books); authoring managers; QR/invite/kiosk
sign-up; approval toggle; kiosk find-or-create; Supabase Auth; ministry-native features
(registration, kiosk, giving/Gift Aid, analytics, branding); **[REV] self-hosted LiveKit live
+ Egress recording (built; needs CPU upgrade)**; **[REV] AI meeting notes**.

**Partly have [REV]:** tenant context (`tenantMiddleware.getTenantContext`); billing/usage
enforcement (`subscriptionEnforcement.ts`, `ministries.subscription_status`).

**New:** monorepo restructure + package extraction (**incl. `packages/live` [REV]**);
product-boundary marker + RLS; `CurrentMinistryProvider` + switcher (extend existing);
content-source tagging + merged resolver + "our content only" (**reconciled with streams
[REV]**); per-ministry feature flags; **[REV] LiveKit room/token tenant-scoping + tenant
recording storage**; join-by-code + admin invite/bulk import; church onboarding + billing
(extend existing); subdomain/custom-domain provisioning; Capacitor + push; **[REV] Mux/Daily
teardown (Phase 7b)**.

**Net:** still ~**70% reorganization**, with new work concentrated in the tenant/content
layer, the product-boundary + **LiveKit [REV]** RLS, and onboarding/billing/domains.

---

## 8. House rules (every PR)

- Never break `main`; every step buildable/runnable.
- One PR per package (Phase 1) / per surface (Phase 2) — small, green.
- `tsc` clean; label every file with its repo path.
- Migrations = numbered SQL in order; edge functions = single `index.ts`.
- Secrets never in the client; **[REV] never in a tracked file** (LiveKit lesson —
  `livekit/.env` only); RLS enforced, not UI-enforced.
- RLS is a hard gate (Phase 4), not a step to rush.

---

## 9. Recommended first deliverable

**Phase 0 + a Phase 1 extraction map** — a file-by-file list of exactly which current
components become `packages/types`, `packages/supabase`, `packages/auth`, **`packages/live`
[REV]**, `packages/ui`, `packages/features`, vs what stays in `apps/rekindle` and what moves
to `apps/ministry`. **[REV] Run the §3a table investigation in parallel** — it's independent
of the extraction and unblocks Phase 4.

*Awaiting go-ahead before any build.*
