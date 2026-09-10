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

Every account is on the same free plan today — there's no paid tier yet:

| Limit | Value |
|---|---|
| Meetings per month | 4 |
| Concurrent active meetings | 2 |
| Max meeting duration | 60 minutes |
| Max participants per meeting | 10 |
| Recording | Not available yet |
| Credit card required | No |

`duration_minutes` / `max_participants` in a `create` call are capped to
these automatically rather than rejected. Hitting the monthly or concurrent
cap returns a `403 quota_exceeded` error (see [Errors](#errors)).

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
    "max_participants": 50,
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
  "maxParticipants": 50,
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
  "maxParticipants": 50,
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
| 403 | `quota_exceeded` — free plan monthly or concurrent-meeting limit reached |
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

This is a Cloudflare **dashboard** task, not something committed to the repo —
same as the rest of `rekindlebc.com`'s hosting (see the domain/hosting
topology notes). Code-side, the app is ready: it builds standalone
(`npm run build` from `apps/developer-portal`) and ships its own SPA
`_redirects` fallback.

1. **New Cloudflare Pages project** for this app — mirror however the
   existing ministry app's Pages project (`rekindle-livekit`, deploys from
   `main`) is configured, except point its root/build at
   `apps/developer-portal` instead. Output directory: `dist`.
2. **Custom domain**: attach `developers.rekindlebc.com` to that new Pages
   project (Pages → your project → Custom domains). Cloudflare adds the DNS
   record for you when you do this from the Pages UI.
3. **⚠️ The wildcard gotcha**: `*.rekindlebc.com` is already wildcard-proxied
   and routed by a Worker (`tenant-router`, route `*.rekindlebc.com/*`) to
   the ministry app's Pages project — the same mechanism that serves tenant
   subdomains like `grace.rekindlebc.com`. That Worker route will intercept
   `developers.rekindlebc.com` too and serve the *ministry app* there instead
   of this portal, unless `developers` is excluded from it. The consumer
   app dodges this today by being **grey-clouded** (DNS-only, bypasses
   Workers entirely) — that trick doesn't work here because Pages-hosted
   domains need to stay proxied. Instead, add an explicit exclusion for the
   `developers` hostname in the `tenant-router` Worker's source (return/pass
   through without rewriting to the ministry app when
   `hostname === 'developers.rekindlebc.com'`), the same way you'd exclude
   any other reserved subdomain from tenant resolution.
4. Verify: `developers.rekindlebc.com` should load the portal's landing page,
   not a ministry workspace or a 404.
