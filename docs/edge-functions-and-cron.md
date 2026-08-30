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

## ⏳ PENDING — Daily reminders (`process-daily-reminders`)

The reminder worker was written to run "on a cron every 15 minutes", but that
schedule was never actually created — so it has never run, and no daily
reminder (Bible/prayer/book/devotional/memory) has ever been delivered,
regardless of what a user set in Account → Reminders. Confirmed 2026-07-28
after a user reported setting a reminder and never receiving one; the save
path and the worker's own logic are both correct, only the schedule was
missing.

1. **Confirm the function is deployed.** Dashboard → Edge Functions →
   `process-daily-reminders` should exist. If not, paste
   [`supabase/functions/process-daily-reminders/index.ts`](../supabase/functions/process-daily-reminders/index.ts)
   and deploy it.
2. **Enable extensions.** Dashboard → Database → Extensions → confirm `pg_cron`
   and `pg_net` are enabled.
3. **Schedule it.** Run
   [`supabase/cron-setup-daily-reminders.sql`](../supabase/cron-setup-daily-reminders.sql)
   once in the SQL editor. Idempotent — safe to re-run. Runs every 15 minutes.

**Verify:** set a reminder a few minutes out in Account → Reminders, wait for a
cron tick (up to 15 min, plus the worker's own 30-min grace window), and
confirm a row lands in `public.notifications` and a push notification
arrives. Inspect with
`select * from cron.job_run_details where jobname = 'process-daily-reminders' order by start_time desc limit 5;`
and `select * from public.daily_reminder_sends where sent_on = current_date;`.

---

## ⏳ PENDING — Ministry subscription reconciliation (`reconcile_ministry_subscriptions`)

Added for fix 8 of `docs/investigations/ministry-billing-tier-enforcement-audit.md`:
a missed Stripe/Paystack webhook could otherwise leave a lapsed ministry's
`ministry_subscriptions.status` stuck at `'active'` forever, with
`current_period_end` stuck in the past. Unlike every other job on this page,
this one is **pure SQL, no edge function** — it's a plain `security definer`
Postgres function (no external I/O needed), scheduled via `pg_cron` directly.

1. **Run the migration.** Paste
   [`supabase/migrations/0298_reconcile_ministry_subscriptions.sql`](../supabase/migrations/0298_reconcile_ministry_subscriptions.sql)
   into the SQL editor — creates `public.reconcile_ministry_subscriptions()`.
2. **Confirm `pg_cron` is enabled.** Dashboard → Database → Extensions (same
   caveat as `process-daily-reminders` above — not confirmed already on for
   this project).
3. **Test it once by hand** before scheduling:
   `select public.reconcile_ministry_subscriptions();` — should return `0`
   (or a small number, if a real lapse already exists) with no error.
4. **Schedule it.** The same migration file's second half (after the `commit;`)
   registers the `pg_cron` job — run it once it's confirmed working. Runs daily
   at 04:00 UTC; demotes any `active` subscription whose `current_period_end`
   is more than 3 days in the past to `past_due` (the same state a real
   `invoice.payment_failed` webhook already sets — self-healing if a delayed
   webhook eventually arrives and overwrites it back to `active`).

**Verify:** `select * from cron.job_run_details where jobname = 'reconcile-ministry-subscriptions' order by start_time desc limit 5;`
after the first scheduled run. To manually create a test case: pick a real
`ministry_subscriptions` row, set `current_period_end = now() - interval '10 days'`
with `status = 'active'`, run the function by hand, confirm it flips to
`past_due` and a `ministry_audit_logs` row appears with
`action = 'subscription_auto_demoted'`.

---

## Reference — other cron-scheduled functions

These follow the same pattern (function + a `schedule.sql`). Listed so the cron
surface is discoverable in one place; assume already deployed unless a change
says otherwise, or the function has its own PENDING section above.

| Function | Cadence | Purpose |
|---|---|---|
| `process-daily-reminders` | every 15 min | **(pending — see above)** User daily reminders (Bible/prayer/etc.) → in-app + push |
| `process-meeting-reminders` | every 5 min | **(this doc)** scheduled-meeting reminders → in-app + email |
| `reconcile_ministry_subscriptions` | daily, 04:00 UTC | **(pending — see above)** Not an edge function — plain SQL, demotes a lapsed `active` subscription to `past_due` if a renewal webhook was missed |
| `process-translation-queue` | see `cron-setup-translation-queue.sql` | UI translation queue |
| `process-scheduled-broadcasts` | see its schedule | Scheduled ministry broadcasts |
| `counselling-reminders` | see its schedule | Counselling session reminders |

Cron setup SQL for the older ones lives at `supabase/cron-setup-*.sql` and inside
each function's folder. To list/remove jobs: `select * from cron.job;` /
`select cron.unschedule('<job-name>');`.
