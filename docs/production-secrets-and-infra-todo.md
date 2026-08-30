# Production Readiness: Secrets & Infrastructure TODO

Compiled by grepping every `Deno.env.get(...)` call across `supabase/functions/**` and the
legacy flat `supabase/<name>/` edge functions, plus every `.env.example`/`vite-env.d.ts`
in the repo. Nothing here is guessed — every secret below is one a real function actually
reads today.

**Note on edge functions (resolved 2026-08-30):** the repo has two layouts — a newer
`supabase/functions/<name>/` set (the CLI-standard one) and an older flat
`supabase/<name>/` set left over from a bulk "rekindle transfer" import. Cross-referenced
every directory name in both trees: only 6 functions actually collided by name
(`livekit-egress`, `livekit-ingress`, `livekit-moderation`, `livekit-token`,
`livekit-webhook`, `send-email-broadcast`) — everything else in either tree is unique to
that one layout, so there was never any real ambiguity for those. Diffed all 6: 4 were
byte-identical (`livekit-egress`, `livekit-moderation`, `livekit-token`,
`send-email-broadcast`); 2 had genuinely diverged, and in both cases the
`supabase/functions/` copy was the newer one — `livekit-webhook` carries a dated,
documented 2026-08-21 bug fix (a channel getting stuck "live" after a dead track) the flat
copy lacked entirely, and `livekit-ingress` predates the `ingress_stream_key` column
(migration 0272) and returns a placeholder `hasKey: false` instead of the real key. The 6
flat-layout duplicates have been deleted from the repo; `supabase/functions/*` is now the
single source for all of them. **If `livekit-webhook` or `livekit-ingress` haven't been
redeployed recently, redeploy both from `supabase/functions/` now** — production may still
be serving the stale flat-copy code for either, deployment being a manual, human-triggered
step in this repo (no CI). A separate, oddly-named `supabase/Send push notification/`
directory (spaces, mixed case — not a valid Supabase function slug) was also found; its
content differs from the real `send-push-notification` but its name means it was never a
name-collision risk to begin with — likely dead import cruft, left alone here since it's
outside this specific "two layouts" problem.

The rest of the flat `supabase/<name>/` tree (payment/donation functions like
`stripe-webhook`, `paystack-webhook`, `create-donation`, etc., and `evangelism-*`) has no
`supabase/functions/` counterpart at all, so — unlike the 6 above — there's no duplicate to
reconcile; the only open question for those is whether they're deployed/live at all, not
which of two copies wins. `evangelism-send-message` and `evangelism-save-channel`
specifically were edited this session (security/tier-gating fixes) and **still need a
manual redeploy** to take effect — not yet confirmed done.

Check items off as each secret is set as a real Supabase secret (**Project Settings →
Edge Functions → Secrets**, not `.env`, which is client-build-time only).

---

## 1. Payment secrets

**Stripe**
- [ ] `STRIPE_SECRET_KEY` — `stripe-webhook`, `stripe-subscription`, `ministry-checkout`, `whatsapp-save-credentials`, `create-wallet-topup`
- [ ] `STRIPE_WEBHOOK_SECRET` — `stripe-webhook`, `ministry-billing-webhook`
- [ ] `STRIPE_WHATSAPP_WEBHOOK_SECRET` — `whatsapp-subscription-webhook` (separate webhook secret for the WhatsApp add-on subscription)
- [ ] `STRIPE_WALLET_WEBHOOK_SECRET` — `wallet-topup-webhook`
- [ ] `STRIPE_PRICE_PREMIUM` / `STRIPE_PRICE_PREMIUM_PLUS` — **currently blank**, see [known issues](#known-issuescleanup-found-while-compiling-this) below; needed before Individual Partner Stripe checkout works at the new $10/$18 pricing

**Paystack**
- [ ] `PAYSTACK_SECRET_KEY` — `cancel-subscription`, `create-donation`, `paystack-webhook`, `paystack-verify`, `paystack-initialize`, `ministry-checkout`, `ministry-billing-webhook`
- [ ] `SITE_URL` — checkout callback base URL (`paystack-initialize`)
- [ ] Real Paystack **Plan Codes** for each Ministry Partner tier (`PAYSTACK_PLAN_<TIER>_<CURRENCY>`) if you want recurring billing rather than one-off charges

**PayPal**
- [ ] No API secret exists — `ministry-checkout` just returns a static `paypal_billing_link_monthly`/`_annual` link from the DB and marks the subscription `pending_paypal_confirmation`. **There is no webhook**, so PayPal revenue is never auto-confirmed — someone has to manually approve these in the admin Partner Plans screen. Decide if this is acceptable long-term or if a real PayPal webhook needs building.

**Payment gateway proxy (non-standard — flag for security review)**
- [ ] `GATEWAY_API_KEY` — used by `create-donation`, `create-counselling-payment`, `create-billing-portal`, `cancel-subscription`, `send-application-notification` to call `stripe.gateway.fastrouter.io` **instead of Stripe directly**. Confirm this third-party proxy is something you intend to keep trusting with payment traffic before launch.

---

## 2. Email secrets (Resend + fallback)

- [ ] `RESEND_API_KEY` — `send-ministry-email`, `send-email-broadcast`, `process-meeting-reminders`
- [ ] `SENDGRID_API_KEY` — `send-email-broadcast` (fallback provider alongside Resend)
- [ ] `FROM_EMAIL` — inconsistent defaults across functions (`announcements@gracecounsel.app`, `noreply@example.com`, `notifications@rekindlebc.com`) — **set explicitly everywhere**, don't rely on defaults
- [ ] `FROM_NAME` — `send-email-broadcast`
- [ ] `UNSUBSCRIBE_SECRET` — `send-email-broadcast`. **Defaults to the literal string `'changeme'`** — must be overridden before launch or unsubscribe links are forgeable
- [ ] `MEETING_APP_ORIGIN`, `MINISTRY_APP_ORIGIN` — link-building origins for reminder emails (`process-meeting-reminders`)

Emails actually sent today: ministry announcements, bulk/broadcast emails, meeting reminders. No Resend-based welcome or payment-receipt email exists — those currently only come from Stripe/Paystack's own receipt emails.

---

## 3. Video/call infrastructure secrets

**LiveKit** (see [tool table](#infrastructure--tools-reference) below for subscription details)
- [ ] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — `livekit-token`, `livekit-moderation`, `livekit-webhook`, `livekit-egress`, `livekit-ingress`
- [ ] S3-compatible storage for Egress recordings: `S3_ACCESS_KEY`, `S3_SECRET`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_BASE`

**Daily.co — likely dead code, not a real production requirement**
- [ ] ~~`DAILY_API_KEY`~~ — read by `daily-room`, `daily-room-cleanup`, `confirm-counselling-session`, but **verified no call site anywhere in the repo actually invokes any of these three functions.** All real video calls (including counselling sessions) run entirely over LiveKit — confirmed via `useDailyRoom`'s own header comment ("Daily removed — LiveKit is the only backend... No @daily-co dependency remains") and no `@daily-co` npm package exists in any `package.json`. `confirm-counselling-session` would genuinely create a real Daily room (with cloud recording) if called, but nothing calls it — it's leftover from before the LiveKit migration. `apps/rekindle/src/lib/daily-recordings.ts` is similarly unimported anywhere.
- [ ] ~~`CLEANUP_SECRET_KEY`~~ — only guards the `daily-room-cleanup` cron endpoint, which just sweeps Daily's API for expired rooms; harmless to leave running but not evidence of active use.
- **Action:** before launch, either (a) confirm via the Supabase dashboard that these three functions truly have zero invocations in their logs, then delete them and drop `DAILY_API_KEY`/`CLEANUP_SECRET_KEY` entirely, or (b) if a counselling-specific Daily integration was actually intended, wire `confirm-counselling-session` into the real booking-confirmation flow (currently `create-counselling-payment` never calls it). Don't just leave it half-wired — it's currently paying for the ability to create real Daily rooms that never get used.

---

## 4. Messaging secrets (WhatsApp / Meta / Zalo)

- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — `whatsapp-save-credentials`, `broadcast-whatsapp`, `evangelism-send-message`, `evangelism-inbox-webhook`
- [ ] `WHATSAPP_API_URL`, `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN` — `broadcast-whatsapp`, `send-whatsapp`
- [ ] `META_APP_ID`, `META_APP_SECRET` — `whatsapp-save-credentials`
- [ ] `META_PAGE_ACCESS_TOKEN`, `META_IG_PAGE_ACCESS_TOKEN`, `META_IG_PAGE_ID`, `META_IG_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` — Meta/Instagram evangelism-inbox channel
- [ ] `ZALO_OA_ID`, `ZALO_ACCESS_TOKEN` — `send-zalo-message`
- [ ] `ENCRYPTION_KEY` — encrypts per-ministry WhatsApp/Meta credentials at rest. **This one is foundational** — if it's ever lost/rotated without a migration, every ministry's saved credentials become unreadable.

---

## 5. Push notification secrets

Three parallel push mechanisms exist — worth reconciling into one before launch:
- [ ] `FCM_SERVICE_ACCOUNT` (current/cleaner path) — `send-push-notification` (functions/ copy)
- [ ] `FCM_PRIVATE_KEY`, `FCM_CLIENT_EMAIL`, `FCM_PROJECT_ID` (legacy split-field path) — `Send push notification` (flat, note the space in the folder name)
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — raw Web Push, scoped only to `counselling-reminders` — a third, separate mechanism
- [ ] `SEND_PUSH_WITH_REMINDERS` — feature flag, `process-daily-reminders`
- [ ] Client-side Firebase web config (public, not secret, but must be set for push to work): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`

---

## 6. AI / LLM secrets

- [ ] `ANTHROPIC_API_KEY` — `spiritual-companion` (primary)
- [ ] `OPENAI_API_KEY` — `spiritual-companion` (fallback), `translate-content`, `process-bulk-tts`, `process-translation-queue`, `generate-tts-audio`, `generate-prayer-content`, `evangelism-ai-suggestion`, `meeting-ai`

---

## 7. Cloudflare secrets

- [ ] `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CUSTOMER_CODE` — `cloudflare-custom-hostname` (backs church white-label custom domains)

(Cloudflare Pages itself needs no secret in the repo — it deploys automatically from GitHub. See the tool table below for what it's actually used for.)

---

## 8. Government/tax integration — HMRC Gift Aid

High-sensitivity: this talks to HMRC's real Government Gateway.
- [ ] `HMRC_GATEWAY_SENDER_ID`, `HMRC_GATEWAY_PASSWORD` — Government Gateway credentials
- [ ] `HMRC_VENDOR_ID`, `HMRC_PRODUCT_NAME`, `HMRC_PRODUCT_VERSION` — vendor registration details
- [ ] `HMRC_TE_URL_TEST` vs `HMRC_TE_URL_LIVE` — **confirm you're pointed at LIVE before real submissions go out**, not the test transaction engine
- [ ] `HMRC_SUBMIT_URL`, `HMRC_POLL_BUDGET_MS`

---

## 9. Core platform

- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — every function depends on these; treat the service-role key as the single most sensitive secret in the whole system (bypasses RLS entirely)
- Geolocation (`detect-region`) needs **no secret** — it calls the free `ipwho.is` endpoint directly.

---

## Infrastructure & Tools reference

Purpose, current plan, what that plan gets you, and when you'd need to move up — for
every external tool the platform actually depends on. Prices/tiers change; treat the
numbers below as directional and confirm on each provider's current pricing page before
budgeting.

| Tool | Purpose here | Current plan | What that tier gives you | When to scale up |
|---|---|---|---|---|
| **LiveKit Cloud** | SFU for all interactive meetings/webinars: rooms, tokens, moderation (mute/remove/roles), HLS egress (recording + webinar broadcast), RTMP ingress (OBS/encoder), RTMP simulcast to YouTube/Facebook, webhooks | **Build** (free tier) — confirmed current | Free participant-minutes up to a monthly cap, meant for pilot/dev use, not guaranteed capacity or support SLA | Billing is participant-minutes + bandwidth (the main cost driver, ~0.02–0.03 GB per participant-minute) + egress minutes only if you use LiveKit's own recording. Move to a paid tier once you have real regular usage (the migration doc ballparks ~$50/mo for ~50 meetings × 5 people × 45 min/mo, but confirm current rates at livekit.io/pricing) — and especially once free-tier caps start throttling or you need an uptime SLA |
| **Cloudflare Pages** | Static hosting + auto-deploy from GitHub for the Ministry app (`rekindle-livekit` Pages project); a Worker in front of it routes `rekindlebc.com` + `*.rekindlebc.com` wildcard tenant subdomains | Not confirmed in code — **check your Cloudflare dashboard** | Free tier: unlimited requests/bandwidth, 500 builds/month, one concurrent build | Scale when you need more concurrent builds, custom build image/longer build times, or advanced access controls — otherwise Pages' free tier is generous for a SPA and rarely the bottleneck |
| **Cloudflare for SaaS** (custom hostnames) | Lets individual churches attach their own custom domain to meeting/broadcast links (`cloudflare-custom-hostname` function, `ministry_groups.white_label_domain`) | Not confirmed — **check dashboard**; this is usually a paid add-on (billed per active custom hostname) even on top of a free/Pro zone | Automatic SSL + routing for each church's custom domain | Scale (i.e. budget for it) as soon as more than a handful of churches actually adopt white-label domains — this is priced per-hostname, so cost tracks adoption directly, not traffic |
| **Supabase** | Postgres DB, Auth, Storage (attachments/recordings), Edge Functions, Realtime (chat/presence) | Not confirmed — **check dashboard** | Free/Pro tiers cap DB size, concurrent connections, Edge Function invocations, and Realtime concurrent connections | Scale when you hit connection-pool limits (common with lots of concurrent meeting participants using Realtime), DB storage caps, or need point-in-time recovery / higher compute for production reliability |
| **Stripe** | Individual Partner + Ministry Partner card payments (US/international) | No subscription — pay-per-transaction (~2.9% + $0.30 typical) | N/A — scales automatically with revenue | No "upgrade" needed; revisit only if you want Stripe Billing's more advanced dunning/retry logic, or negotiated volume pricing at high revenue |
| **Paystack** | Nigeria-region card/bank/USSD/mobile-money payments | No subscription — pay-per-transaction | N/A | Same as Stripe — scales with volume, no tier to move up |
| **Resend** | Ministry announcement emails, broadcast emails, meeting reminder emails | Not confirmed — **check dashboard**; free tier is typically capped at a few hundred–few thousand emails/day | Free tier is fine for low-volume transactional email | Scale once you're sending broadcast emails to large congregation lists regularly — free tier's daily cap is the thing that'll bite first |
| **Daily.co** | ~~Counselling-session video rooms~~ — **verified unused.** All video (including counselling) already runs on LiveKit; the Daily edge functions exist but have no call sites | N/A — no reason to keep paying for/maintaining this account | N/A | Don't scale this — retire it. Delete `daily-room`, `daily-room-cleanup`, `confirm-counselling-session`, and the `DAILY_API_KEY`/`CLEANUP_SECRET_KEY` secrets once confirmed zero invocations in the Supabase function logs |
| **OpenAI / Anthropic** | AI features: spiritual companion chat, prayer content generation, translation, TTS, evangelism AI suggestions, meeting AI | Pay-as-you-go API usage, no fixed subscription | N/A | Watch per-feature token spend as usage grows — TTS and translation in particular can get expensive at volume; consider caching/rate-limiting before it becomes a cost problem |
| **Twilio (WhatsApp)** | WhatsApp messaging fallback (per-ministry or platform default) | Pay-per-message | N/A | Scales with message volume automatically |
| **Meta / WhatsApp Cloud API** | Direct WhatsApp Business + Instagram/Facebook messaging for the evangelism-inbox feature | Free tier covers a monthly conversation quota, then pay-per-conversation | Free conversations up to Meta's monthly limit | Scale once a ministry's evangelism-inbox conversation volume regularly exceeds the free tier |
| **Firebase (FCM)** | Push notifications (web + mobile via Capacitor) | Free (Spark) — FCM itself is free regardless of plan | Free, no meaningful cap on FCM send volume | Rarely a scaling concern — FCM message delivery itself is free at any volume; only matters if you add other Firebase products (Firestore, Analytics) that have their own paid tiers |

---

## Known issues/cleanup found while compiling this

Not asked for directly, but surfaced while inventorying the above — worth a pass before/around launch:

- **Mux and Cloudflare Stream are fully retired** (LiveKit Egress/Ingress replaced both), but `packages/ministry/src/components/MinistryInteractiveMeetings.tsx` still has comments saying "Cloudflare live input"/"Cloudflare HLS stream" around the webinar code, and `packages/live/src/components/MuxVodPlayer.tsx` is still named after Mux even though it's just an hls.js player now. Purely cosmetic (no functional bug) but actively misleading about the architecture — worth a rename/comment pass.
- **`STRIPE_PRICE_PREMIUM`/`STRIPE_PRICE_PREMIUM_PLUS` are currently blank** (the old Price IDs pointed at the pre-repricing $9.99/$19.99 amounts and were intentionally cleared) — Stripe checkout for Individual Partner tiers won't work until new $10/$18 Price objects are created and set.
- **`UNSUBSCRIBE_SECRET` defaults to `'changeme'`** if unset — must be overridden.
- **Three separate push-notification implementations** (FCM service-account, FCM split-fields, raw VAPID for counselling only) — worth consolidating to one.
- **`apps/rekindle/src/vite-env.d.ts` is incomplete** — doesn't declare the Firebase vars, `VITE_LIVEKIT_URL`, `VITE_VIDEO_BACKEND`, or `VITE_APP_TYPE` that are actually used. `apps/ministry` has no `vite-env.d.ts` at all.
- **`VITE_PUBLIC_APP_URL`** may still be lingering as a Cloudflare Pages dashboard-only env var (separate from any `.env` file, so invisible to repo search) — per `docs/white-label-custom-domain-plan.md`, confirm it's actually been deleted there.
- **PayPal has no webhook** — Ministry Partner PayPal subscriptions rely entirely on manual admin approval in the Partner Plans screen; there's no automatic revenue confirmation.
- **Two edge-function layouts** (`supabase/functions/<name>/` vs legacy flat `supabase/<name>/`) with overlapping duplicates — confirm in the Supabase dashboard which copy of each is actually deployed, and delete the stale one to stop the drift.
- **Daily.co is dead code, not a live dependency** — `daily-room`, `daily-room-cleanup`, and `confirm-counselling-session` all still call Daily's real API and require `DAILY_API_KEY`, but nothing in the app actually invokes any of them (verified by searching for call sites across the whole repo). All video, including counselling sessions, already runs on LiveKit. Retire these functions/secrets rather than budgeting for a video vendor that isn't in the loop.
