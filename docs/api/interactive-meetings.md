# Interactive Meetings API

A REST-ish API for creating and running video meetings from your own app or
server — for any company or product, no ReKindle ministry/consumer account
required. Built on the same LiveKit infrastructure, and the **same "Free
Ministry Meetings" free plan**, as the in-app Interactive Meetings feature —
this is just the other front door to it, for people integrating rather than
clicking a button in the ReKindle app.

## Getting a key

**Sign up at the developer portal** (deploys separately from the ReKindle
apps — see the repo's `apps/developer-portal`) → create an account with your
email → **Create Key** on the dashboard → copy the key it shows you, which
starts with `rkm_live_` and is shown **only once**.

(Existing ReKindle account holders can alternatively generate a key from
Profile → Developer → API Keys in the consumer app — it's the same API and
the same free plan either way.)

Keep the key secret — anyone with it can create and control meetings under
your account. Revoke a compromised key from your dashboard at any time.

## Free plan limits — "Free Ministry Meetings"

Every account is on the same free plan today — there's no paid tier yet.
Gated on a monthly **time budget**, not a meeting count — create as many
meetings as you want, as long as their allotted durations add up to 10
hours or less this month:

| Limit | Value |
|---|---|
| Meeting time per month | 10 hours (no cap on number of meetings) |
| Concurrent active meetings | 3 |
| Max meeting duration | 60 minutes |
| Max participants per meeting | 15 |
| Recording | Not available yet |
| Credit card required | No |

`duration_minutes` / `max_participants` in a `create` call are capped to
these automatically rather than rejected. Hitting the monthly-hours or
concurrent cap returns a `403 quota_exceeded` error (see [Errors](#errors)).

## Base URL

```
https://<your-supabase-project>.functions.supabase.co/meetings-api
```

## Authentication

Every request is a `POST` with:

```
Authorization: Bearer rkm_live_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

There is no separate per-endpoint path — the JSON body's `action` field
selects the operation (matching the rest of this codebase's Edge Functions).

## Actions

### `create` — start a meeting

```bash
curl -X POST https://<project>.functions.supabase.co/meetings-api \
  -H "Authorization: Bearer rkm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "title": "Weekly Team Sync",
    "description": "Optional",
    "duration_minutes": 60,
    "max_participants": 15,
    "enable_recording": false,
    "metadata": { "external_id": "your-own-reference-id" }
  }'
```

Response:

```json
{
  "id": "b2b1...",
  "roomName": "api-1a2b3c4d-1699999999999",
  "title": "Weekly Team Sync",
  "durationMinutes": 60,
  "maxParticipants": 15,
  "recordingEnabled": false,
  "createdAt": "2026-09-09T12:00:00.000Z"
}
```

`duration_minutes` and `max_participants` are capped to the free plan limits
above. `enable_recording` is accepted but always comes back `false` for now —
recording isn't offered on the free plan yet.

### `join-token` — get a participant a way in

Your integration decides who's a `host`, `attendee`, or `viewer` — the API
trusts you to assign roles for your own end users, since you're already
authenticated as the meeting's owner.

```bash
curl -X POST https://<project>.functions.supabase.co/meetings-api \
  -H "Authorization: Bearer rkm_live_xxx" -H "Content-Type: application/json" \
  -d '{ "action": "join-token", "meetingId": "b2b1...", "participantName": "Jordan", "role": "host" }'
```

Response:

```json
{ "url": "wss://your-livekit-server", "token": "eyJhbG...", "role": "host" }
```

Use `url` + `token` with any [LiveKit client SDK](https://docs.livekit.io/) —
JavaScript, React Native, Swift, Android, Flutter — to join the call from your
own UI. Tokens expire after 2 hours; request a fresh one per join.

### `get` — check a meeting's status

```json
{ "action": "get", "meetingId": "b2b1..." }
```

```json
{
  "id": "b2b1...",
  "title": "Weekly Team Sync",
  "isActive": true,
  "participantCount": 3,
  "durationMinutes": 60,
  "maxParticipants": 15,
  "recordingEnabled": false,
  "metadata": { "external_id": "your-own-reference-id" },
  "createdAt": "...", "startedAt": "...", "endedAt": null
}
```

`participantCount` is live (queried from LiveKit at call time), not cached.

### `list` — your recent meetings

```json
{ "action": "list", "limit": 20 }
```

Paginate with `before` (an ISO timestamp from the oldest item you've seen):

```json
{ "action": "list", "limit": 20, "before": "2026-09-01T00:00:00.000Z" }
```

### `end` — end a meeting for everyone

```json
{ "action": "end", "meetingId": "b2b1..." }
```

```json
{ "success": true }
```

## Errors

| Status | Meaning |
|---|---|
| 401 | Missing, invalid, or revoked API key |
| 403 | `quota_exceeded` — free plan's monthly hours or concurrent-meeting limit reached |
| 404 | Meeting not found (or belongs to a different account) |
| 409 | Meeting has already ended (`join-token`) |
| 400 | Missing/invalid field |

Every error response is `{ "error": "..." }` (and sometimes `"reason"` with
more detail).

## Limitations (v1)

- **Meetings only, not webinars.** The audience-facing HLS/webinar mode
  available in the app isn't exposed here yet — every API-created meeting is
  a plain multi-party room.
- **No rate limiting yet.** Be a good citizen; heavy abuse may get a key
  revoked.
- **No webhooks yet.** Poll `get`/`list` for status; a `meetingId` becomes
  inactive automatically once its LiveKit room empties out and times out, or
  when you call `end`.

## Deploying the portal (`apps/developer-portal`) to `developers.rekindlebc.com`

Deployed and verified 2026-09-10. Not classic Pages — Cloudflare's current
"Create an app → Import a repository" flow deploys this as a **Worker with
static assets**, driven by `apps/developer-portal/wrangler.jsonc`
(`assets.directory: "./dist"`, `not_found_handling: "single-page-application"`
for the SPA fallback — no `_redirects` file; that's Pages-only and actually
causes a "redirect loop" deploy error under Workers Assets, since it fights
`not_found_handling`).

1. **Cloudflare dashboard** → Workers & Pages → Create → Import a repository
   → this repo. Project name `rekindle-developer-portal` (must match
   `wrangler.jsonc`'s `name`). Path: `apps/developer-portal`. Build command
   `npm run build`, deploy command `npx wrangler deploy` (all dashboard
   defaults once Path is set). This gives it a live URL at
   `rekindle-developer-portal.<account>.workers.dev` — no custom-domain
   attachment needed for what follows.
2. **The wildcard gotcha**: `*.rekindlebc.com` is wildcard-proxied and
   entirely owned by the `tenant-router` Worker (route `*.rekindlebc.com/*`),
   which rewrites every subdomain's hostname to `rekindle-livekit.pages.dev`
   (the ministry app) and re-fetches. Left alone, `developers.rekindlebc.com`
   would resolve to the ministry app instead of this portal — and since this
   is a Worker doing a plain hostname-rewrite proxy (not a Pages custom
   domain), the fix is a one-line branch in that same Worker, not a DNS or
   Pages change:

   ```js
   export default {
     async fetch(request) {
       const target = new URL(request.url);
       target.hostname = target.hostname === 'developers.rekindlebc.com'
         ? 'rekindle-developer-portal.<account>.workers.dev'
         : 'rekindle-livekit.pages.dev';
       return fetch(new Request(target, request));
     },
   };
   ```

3. Verify: `developers.rekindlebc.com` should load the portal's landing page,
   not a ministry workspace or a 404.
