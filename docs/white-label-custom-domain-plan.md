# White-label custom domains for interactive meetings & live broadcasts

**Status:** planned (not started). Phase 0 is an immediate config fix, not a build.
**Last updated:** 2026-07-17

---

## 1. In plain terms

When a church starts a meeting and shares the link, that link can send people to the
**main consumer app** (`app.rekindlebc.com`) instead of the church's own web address.
A visitor invited by Grace Community Church clicks their link and lands on a page
branded ReKindle, not Grace — which defeats white-label.

The end state we want: *a visitor clicks Grace's meeting invite, lands on Grace's own
web address, joins the meeting, and never sees the word ReKindle anywhere.*

---

## 2. Current state (read this before planning work)

The ministry app is **already self-contained** for guest meeting join and live-broadcast
watch (commit `e3961c2`). It has its own public routes, mounted *outside* the auth gate:

| Route | Component | Purpose |
| --- | --- | --- |
| `/channels/:id` | `ChannelWatchPage` (`packages/live`) | guest watches a live broadcast |
| `/ministry/:ministryId/meeting/:meetingId` | `MeetingJoinPage` (`packages/live`) | guest meeting join page |
| `/channel/:channelId/meeting/:meetingId` | `MeetingJoinPage` | guest meeting join page |
| `/ministries/:ministryId/live` | `MinistryLiveWrapper` (`packages/ministry`) | the live/meeting room |

**Link building today:**

- **Live broadcast** links (`ShareChannelButton`) already use `window.location.origin`
  → they stay on the ministry's own domain. ✅ No problem here.
- **Meeting** links use `publicAppOrigin()` (`packages/features/src/liveShare.ts:24`),
  which is `VITE_PUBLIC_APP_URL || window.location.origin`.

### ⚠️ Phase 0 — the one-setting fix (do this first, ~2 minutes)

An earlier, **since-reversed** plan routed ministry meeting links to the consumer app and
instructed setting `VITE_PUBLIC_APP_URL=https://app.rekindlebc.com` in the **ministry
Cloudflare Pages env**. That decision was reversed, and the var was removed from
`apps/ministry/.env` — but **Pages env vars are separate from `.env`**, so if it is still
set in the Pages dashboard it still overrides the origin and forces the redirect.

> **Action:** Cloudflare Pages → `rekindle-livekit` project → Settings → Environment
> variables → **delete `VITE_PUBLIC_APP_URL`** → redeploy.

After this, meeting links stay on whatever ministry domain the leader is on — including a
custom domain, today. **`VITE_PUBLIC_APP_URL` must not be set anywhere.**

---

## 3. What already exists (so the build is small)

| Capability | Where | Status |
| --- | --- | --- |
| `white_label_domain`, `domain_status`, `slug` columns | `ministry_groups` | ✅ |
| Provision / verify / remove custom domain (Cloudflare custom hostnames) | `packages/features/src/customDomain.ts` | ✅ |
| Hostname → ministry resolution, anon-safe | `packages/features/src/ministryHostname.ts` + `get_ministry_by_hostname` RPC | ✅ |
| Public guest meeting-join + channel-watch routes | ministry app router | ✅ |
| Edge functions accept any origin (CORS `*`) | `livekit-token`, `send-push-notification` | ✅ no change |
| Guest LiveKit tokens (anon, capped to viewer/attendee) | `supabase/functions/livekit-token/index.ts` | ✅ |

`domain_status` values: `none | pending | verifying | active | error`.
Custom domain UI is gated on `entitlements.caps.customDomain`.

---

## 4. The plan

### Phase 1 — Canonical ministry origin resolver *(the actual code change; small)*

**Problem:** a link today inherits whatever origin the leader happens to be on. If a Grace
leader shares from the apex, the link says `rekindlebc.com/...`, not `grace.org/...`. The
link should be built from the *ministry's* address, not the browser's current one.

**Add** `packages/features/src/ministryOrigin.ts`:

```ts
// Canonical public origin for a ministry's shareable links.
export function ministryOrigin(m: {
  white_label_domain?: string | null;
  domain_status?: string | null;
  slug?: string | null;
}): string {
  if (m.white_label_domain && m.domain_status === 'active') return `https://${m.white_label_domain}`;
  if (m.slug) return `https://${m.slug}.${MINISTRY_DOMAIN}`; // VITE_MINISTRY_DOMAIN, default rekindlebc.com
  return typeof window !== 'undefined' ? window.location.origin : '';
}
```

**Swap the call sites** (they need the ministry's `white_label_domain` / `domain_status` /
`slug` in scope — currently only `ministry_id` is available, so source them from
`CurrentMinistryContext` or pass as a prop):

- `packages/ministry/src/components/MinistryInteractiveMeetings.tsx` lines **514**, **1562**, **1696**
- `packages/live/src/components/ShareChannelButton.tsx:41` — accept an optional origin
  override for ministry-context channels (keeps `window.location.origin` as default)

**Then delete** `publicAppOrigin()` (`liveShare.ts:24`) and every reference to
`VITE_PUBLIC_APP_URL`, so the consumer-redirect can never regress.

*Effort: a couple of hours. Risk: low.*

### Phase 2 — Make the custom hostname actually serve the app *(infra)*

Today `rekindlebc.com` + `*.rekindlebc.com` → tenant-router Worker → `rekindle-livekit.pages.dev`.
A church's own domain (`gracechurch.org`) needs the Cloudflare-for-SaaS custom hostname
(which `customDomain.ts` provisions) to route to that same origin, **and** the SPA fallback
(`apps/ministry/public/_redirects` → `/* /index.html 200`) must apply on that host.

Verify: `curl https://<custom-domain>/ministry/<id>/meeting/<id>` returns `index.html`.
Only flip `domain_status='active'` once the cert is issued **and** the host serves the app.

### Phase 3 — Per-origin auth & push *(the real constraint — decide before building)*

Browsers treat each origin as a separate world. This is the part that genuinely limits
arbitrary custom domains:

- **Supabase Auth redirect allowlist** — every custom domain must be whitelisted for
  OAuth / magic-link redirects. This does **not** scale to arbitrary tenant domains. Either
  (a) add each domain to Supabase Auth → Redirect URLs, or (b) centralize the auth callback
  on one host and hand off to the tenant domain afterwards.
- **Push (FCM)** — notification permission and the service worker are per-origin. A member
  on `grace.org` must re-grant push and gets a separate token. (The ministry Pages build
  also still needs `VITE_FIREBASE_*` set for push to init at all.)
- **Sessions are per-origin** — signing in on `grace.rekindlebc.com` does not carry to
  `grace.org`.

> **Guests are unaffected.** They type a name and join — no auth, no redirect, no push.
> So guest meeting join + broadcast watch work on any domain **today**. Phase 3 only bites
> *members signing in* on a custom domain.

**Open product decision:** do members sign in on the church's own domain, or is the custom
domain only for guests/visitors (with members using the tenant subdomain)? The answer
decides whether Phase 3 is a small allowlist chore or a real auth-architecture change.

### Phase 4 — Rollout

- Keep gating on `entitlements.caps.customDomain` (already in place).
- The `ministryOrigin` fallback chain means a church without an active custom domain keeps
  working on its slug subdomain — no flag-day migration.

---

## 5. Test matrix

Share a link and open it logged-out (private window) **and** as a member:

| Shared from | Meeting link | Broadcast link |
| --- | --- | --- |
| apex (`rekindlebc.com`) | → ministry's canonical origin | → ministry's canonical origin |
| slug subdomain (`grace.rekindlebc.com`) | stays on subdomain | stays on subdomain |
| custom domain (`grace.org`, active) | stays on custom domain | stays on custom domain |

For each: join page loads → shows ministry name + title + description → guest joins → room
connects → camera toggles on first try.

---

## 6. Summary

- **Phase 0** (delete `VITE_PUBLIC_APP_URL` from Pages) gets most of the visible win now.
- **Phase 1** is small and makes links canonical rather than "whatever origin you're on".
- **Phase 3** is the only genuinely hard part, and it's a product decision, not code.
