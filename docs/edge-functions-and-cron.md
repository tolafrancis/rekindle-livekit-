# Edge functions & cron — manual deploy steps

Edge functions in this repo are **not** auto-deployed. Each lives as source under
`supabase/functions/<name>/` (or `supabase/<name>/`) and must be pasted into the
Supabase Dashboard → **Edge Functions** by hand, and any pg_cron schedule run once
in the SQL editor. This doc tracks the steps that are still pending after a code
change so nothing is silently half-wired.

Project ref: `vpnpembyqbbaaiynfvli`

---

## ⏳ PENDING — Meeting reminders (`process-meeting-reminders`)

Added with scheduled-meeting timezones + reminders (migrations `0247` + `0248`).
Covers **both** meeting kinds — ministry meetings (`ministry_video_meetings`) and
live-channel meetings (`live_channel_video_meetings`) — and includes anyone who
**registered** (`meeting_registrations`), guests included. The UI and DB are live;
the reminder cron is **not running yet**. Until steps 1–2 are done, hosts can set
reminder offsets and people can register, but no reminders fire.

1. **Deploy the function.** Dashboard → Edge Functions → new function named exactly
   `process-meeting-reminders`. Paste
   [`supabase/functions/process-meeting-reminders/index.ts`](../supabase/functions/process-meeting-reminders/index.ts)
   and deploy.
2. **Schedule it.** Run
   [`supabase/functions/process-meeting-reminders/schedule.sql`](../supabase/functions/process-meeting-reminders/schedule.sql)
   once in the SQL editor. Replace `<PROJECT_REF>` = `vpnpembyqbbaaiynfvli` and
   `<SERVICE_ROLE_KEY>` (Settings → API → service_role key). Runs every 5 minutes.
3. **Email secrets** (email half only). Set on the function under Settings → Edge
   Functions → secrets:
   - `RESEND_API_KEY` — from resend.com
   - `FROM_EMAIL` — e.g. `notifications@rekindlebc.com` (must be a Resend-verified sender)
   - `MEETING_APP_ORIGIN` — consumer/channel app origin for channel-meeting links
     (defaults to `https://app.rekindlebc.com`)
   - `MINISTRY_APP_ORIGIN` — ministry app origin for ministry-meeting links
     (defaults to `https://rekindlebc.com`, else falls back to `MEETING_APP_ORIGIN`)

   Without the email secrets, **in-app bell reminders still work**; only the email
   is skipped. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

**Verify:** create a scheduled meeting a few minutes out with the "15 minutes
before" reminder, wait for a cron tick, and confirm a row lands in
`public.notifications` (and an email arrives). Inspect the cron with
`select * from cron.job;`. Recipients = host + eligible members/followers (access-
level aware) + registrants (`meeting_registrations`, guests emailed only); delivery
is idempotent via `meeting_reminder_sends` (keyed on `recipient_key`).

---

## Reference — other cron-scheduled functions

These follow the same pattern (function + a `schedule.sql`). Listed so the cron
surface is discoverable in one place; assume already deployed unless a change says
otherwise.

| Function | Cadence | Purpose |
|---|---|---|
| `process-daily-reminders` | every 15 min | User daily reminders (Bible/prayer/etc.) → in-app + push |
| `process-meeting-reminders` | every 5 min | **(this doc)** scheduled-meeting reminders → in-app + email |
| `process-translation-queue` | see `cron-setup-translation-queue.sql` | UI translation queue |
| `process-scheduled-broadcasts` | see its schedule | Scheduled ministry broadcasts |
| `counselling-reminders` | see its schedule | Counselling session reminders |

Cron setup SQL for the older ones lives at `supabase/cron-setup-*.sql` and inside
each function's folder. To list/remove jobs: `select * from cron.job;` /
`select cron.unschedule('<job-name>');`.
