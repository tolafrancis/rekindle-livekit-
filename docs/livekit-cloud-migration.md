# LiveKit Cloud migration — budget, requirements, steps

## Why this exists (the problem)

Live meetings/livestreams fail for users on Nigerian carriers (e.g. Glo). Root cause
is **carrier-level network reachability**, not the app:

- The self-hosted LiveKit server (`livekit.rekindlebc.com` → `76.13.219.239`) is on a
  Hostinger VPS in **Malaysia**. From Glo, even a plain HTTPS request to it times out
  (`ERR_TIMED_OUT`).
- The server is healthy — it returns HTTP 200 in ~2s from other networks.
- The rest of the platform (Supabase auth, login, website) works fine on Glo — the
  failure is isolated to the LiveKit host's IP/route.
- **VPN fixes it instantly**, which proves it's a routing problem between Nigerian
  carriers and the Malaysian IP range, not client/app logic.

West-African carriers peer well with **Europe** and reasonably with **US East**, but
have thin/unreliable routes into Southeast-Asian ranges. No code change can fix a
route a carrier won't carry — the SFU has to live on a better-reachable network.
(US reachability of the current server was still unconfirmed as of writing — test it.)

## The key finding that makes this easy

**The client never hardcodes the LiveKit URL — it reads it from the `livekit-token`
function's response.**

- Server returns it: `supabase/livekit-token/index.ts` → `return json({ url: LIVEKIT_URL, token, role })`.
- Client uses it: `packages/live/src/useDailyRoom.ts` → `return { url: data.url, token: data.token }` → `wrapper.joinMeeting(roomInfo.url, …)`.

So the entire platform points at whatever `LIVEKIT_URL` the edge functions use.
**Switching servers is a config change — no client rebuild for the URL swap.**

> `VITE_LIVEKIT_URL` exists in `apps/rekindle/.env` but is **not consumed anywhere in
> code** (vestigial). The only other mentions of the old host are comments in
> `apps/ministry/capacitor.config.ts` and `docs/mobile-app-build-plan.md`. No
> functional hardcoded reference exists.

---

## Budget

**Start free — validate at $0 first.** LiveKit Cloud has a free "Build" tier. Create a
project, point a pilot at it, and test from a Glo device *before* spending anything.
This answers the real open question (does moving off Malaysia actually fix Nigeria?)
at zero cost.

**Billing model** (three lines):
1. **Participant-minutes** (connection minutes) — cheap; usually a rounding error.
2. **Bandwidth (GB)** — the real driver for video: an SFU relays every participant's
   stream to everyone else.
3. **Egress minutes** — only if you use *LiveKit's* recording.

**Why our bill stays bounded:** webinar audiences watch **Mux/Cloudflare HLS** and the
host pushes **RTMP to Mux** — those viewers never touch LiveKit. So Cloud bandwidth is
driven by *interactive meeting* participants only (everyone-on-camera meetings), not
by broadcast audiences. (Confirm whether `livekit-egress` is actually invoked for
recordings; if it is, that's a separate per-minute line.)

**Estimate your own cost:**
- `participant-minutes/month = Σ (participants × meeting length)` across interactive meetings.
- `bandwidth ≈ participant-minutes × ~0.02–0.03 GB` (multi-party camera video, moderate
  quality ≈ ~24 MB per participant-minute in a 5-person call).

**Worked example (illustrative):** 50 meetings/mo × 5 people × 45 min = **11,250
participant-minutes** → **~250–330 GB** bandwidth → lands inside an entry paid tier
(**order of ~$50/month**); a light pilot fits the free tier. Heavy usage (many large,
long, all-camera meetings) scales the bandwidth line up from there.

> ⚠️ All dollar figures are ballpark. **Confirm current tiers and per-GB / per-minute
> rates at livekit.io/pricing** — they change. Use the formulas above with the real
> rates to get your number.

---

## Requirements (what actually changes)

| Item | Change |
|---|---|
| **Client apps** | **None** for the URL swap — it's server-driven via the token response. |
| **Supabase secrets** | Set 3 project secrets, shared by all `livekit-*` functions: `LIVEKIT_URL` (→ `wss://<you>.livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. |
| **Webhooks** | In the Cloud dashboard, register a webhook → your `livekit-webhook` function URL, signed with the same key/secret. (Self-host set this in `config.yaml`; Cloud sets it in project settings.) |
| **Egress / Ingress** | `supabase/livekit-egress` & `supabase/livekit-ingress` use the same SDK and work against Cloud, but Cloud egress is a **separately billed** service — verify after cutover. |
| **Mux / Cloudflare** | Unchanged — independent of the SFU. |

The five functions that read the LiveKit secrets: `livekit-token`, `livekit-moderation`,
`livekit-webhook`, `livekit-egress`, `livekit-ingress`.

---

## Steps (pilot → cutover → decommission)

1. **Create the Cloud project** → note `wss://…livekit.cloud`, API key, API secret.
2. **Pilot ($0):** point a staging build (or a throwaway copy of the `LIVEKIT_URL`
   secret) at the Cloud project and **run a real meeting from a Glo device** (and a US
   network). This is the go/no-go for the whole migration.
3. **Cutover:** set the 3 secrets in Supabase → **redeploy the 5 `livekit-*` edge
   functions** so they pick up the new values. No app redeploy needed for the URL swap.
4. **Register the webhook** in the Cloud dashboard → confirm `livekit-webhook` receives
   events (room started/finished, participant joined, egress status).
5. **Verify egress/ingress:** run a webinar/recording and confirm the RTMP-to-Mux path
   still fires (and whether it routes through `livekit-egress`).
6. **Validate broadly:** Glo / MTN / Airtel + US + a couple more regions. Watch the
   Cloud dashboard for connection quality per region.
7. **Keep the Malaysia VPS running** as instant rollback until confident.
8. **Decommission** the old VPS once stable. Optionally drop the vestigial
   `VITE_LIVEKIT_URL` from `.env`.

**Rollback is trivial:** revert the 3 secrets + redeploy the functions.

---

## Ownership

- **Yours (can't be done from the repo):** create the LiveKit Cloud account/project;
  set the secret *values* in the Supabase dashboard.
- **Can be driven in-repo:** redeploy the 5 edge functions, verify token / moderation /
  webhook / egress paths, and confirm nothing hardcodes the old host.

## Alternative (if staying self-hosted)
Relocate the SFU to a well-peered **EU host** (Frankfurt/Amsterdam/London) + enable
LiveKit's embedded **TURN over TLS on 443**, after testing the new IP from Glo/MTN/Airtel
and a US network. Cheaper, keeps control, but still single-region and the ops are yours.
See the network-reachability discussion for the full option comparison.
