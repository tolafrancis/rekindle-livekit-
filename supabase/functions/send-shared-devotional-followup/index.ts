// supabase/functions/send-shared-devotional-followup/index.ts
//
// The morning after someone signs up from a shared devotional link, email
// them that day's devotional plus the app's store link, so the next devotional
// finds them without anyone sharing another link.
//
// Rows come from public.shared_devotional_followups, written by the web app
// the first time a person opens a shared devotional (recordSharedDevotionalOpen).
// Each run (pg_cron, hourly, migration 0401) handles pending rows:
//   - skipped: the account is older than the link (not a new sign-up), the
//     person has no email consent (email_opt_in, consent_devotionals), or
//     they already have the phone app (an active android/ios push token);
//   - waiting: it isn't yet the next calendar day, 7-10am, in their time zone;
//   - sent: one email, then the row is closed. Never sent twice.
//
// Callers: pg_cron with a service-role JWT from the vault, or a platform admin
// (body { dryRun: true } lists what would happen without sending).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CONSUMER_URL = 'https://app.rekindlebc.com'
const MINISTRY_URL = 'https://rekindlebc.com'
const DEFAULT_PLAY = {
  consumer: 'https://play.google.com/store/apps/details?id=com.rekindlebc.app',
  ministry: 'https://play.google.com/store/apps/details?id=com.rekindlebc.ministry',
}
// A sign-up counts as "from the link" when the account was created at most
// this long before the shared devotional was first opened.
const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 60 * 1000
// Give up on rows nobody could be emailed for within a week.
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000
const SEND_FROM_HOUR = 7
const SEND_UNTIL_HOUR = 10
const BATCH = 200

type Row = Record<string, any>

function jwtRole(authHeader: string | null): string | null {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))
    return JSON.parse(json)?.role ?? null
  } catch {
    return null
  }
}

/** Local calendar date (YYYY-MM-DD) and hour for an instant in a time zone. */
function localParts(at: Date, tz: string): { date: string; hour: number } {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    }).formatToParts(at)
  let parts: Intl.DateTimeFormatPart[]
  try { parts = fmt(tz || 'UTC') } catch { parts = fmt('UTC') }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Same signed token as send-email-broadcast, read by the email-unsubscribe function.
async function unsubscribeToken(userId: string, email: string, secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = `${userId}|${email}|${issuedAt}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return btoa(`${payload}|${sigHex}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** That day's devotional from the same source as the one they were shared. */
async function todaysDevotional(supabase: SupabaseClient, row: Row, shared: Row | null, localDate: string) {
  if (row.kind === 'ministry') {
    const ministryId = shared?.ministry_id
    if (!ministryId) return null
    const { data } = await supabase.from('ministry_devotionals').select('id, title, scheduled_date')
      .eq('ministry_id', ministryId).eq('is_published', true)
      .lte('scheduled_date', `${localDate}T23:59:59`)
      .order('scheduled_date', { ascending: false }).limit(1)
    return data?.[0] ?? null
  }
  let query = supabase.from('devotionals').select('id, title, schedule_date')
    .eq('is_published', true).lte('schedule_date', `${localDate}T23:59:59`)
    .order('schedule_date', { ascending: false }).limit(1)
  if (shared?.stream_id) query = query.eq('stream_id', shared.stream_id)
  const { data } = await query
  return data?.[0] ?? null
}

function buildEmail(o: {
  name: string; sharedTitle: string; sourceName: string | null; today: { title: string; url: string };
  appName: string; playStore: string; appStore: string; unsubscribeUrl: string;
}) {
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:4px;padding:12px 22px;border-radius:999px;font-weight:600;text-decoration:none;${
      primary ? 'background:#7c3aed;color:#ffffff;' : 'background:#f3e8ff;color:#5b21b6;'}">${escapeHtml(label)}</a>`
  const stores = [
    o.playStore ? button(o.playStore, 'Get it on Google Play', false) : '',
    o.appStore ? button(o.appStore, 'Download on the App Store', false) : '',
  ].join('')
  const from = o.sourceName ? ` from ${escapeHtml(o.sourceName)}` : ''
  const subject = `Today's devotional: ${o.today.title}`
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#ffffff;border-radius:16px;padding:28px 24px;">
    <p style="margin:0 0 12px;font-size:16px;">Hi ${escapeHtml(o.name)},</p>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Yesterday you read <strong>${escapeHtml(o.sharedTitle)}</strong>${from}. Today's devotional is ready for you:</p>
    <p style="margin:16px 0;font-size:20px;font-weight:700;font-family:Georgia,serif;">${escapeHtml(o.today.title)}</p>
    <div style="text-align:center;margin:20px 0;">${button(o.today.url, "Read today's devotional", true)}</div>
    ${stores ? `<hr style="border:none;border-top:1px solid #ede9fe;margin:24px 0;">
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;">Get tomorrow's devotional on your phone</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#4b5563;">The ${escapeHtml(o.appName)} app reminds you each morning and reads the devotional aloud wherever you are.</p>
    <div style="text-align:center;">${stores}</div>` : ''}
  </div>
  <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#6b7280;">You're getting this once because you signed up to read a shared devotional.
  <a href="${escapeHtml(o.unsubscribeUrl)}" style="color:#7c3aed;">Unsubscribe</a></p>
</div></body></html>`
  const text = `Hi ${o.name},\n\nYesterday you read "${o.sharedTitle}"${o.sourceName ? ` from ${o.sourceName}` : ''}. Today's devotional is ready: ${o.today.title}\n${o.today.url}\n\n` +
    (o.playStore || o.appStore ? `Get tomorrow's devotional on your phone with the ${o.appName} app:\n${[o.playStore, o.appStore].filter(Boolean).join('\n')}\n\n` : '') +
    `Unsubscribe: ${o.unsubscribeUrl}`
  return { subject, html, text }
}

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Cron (service-role JWT, verified at the gateway) or a platform admin.
  const authHeader = req.headers.get('Authorization')
  if (jwtRole(authHeader) !== 'service_role') {
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) return json({ error: 'Admin access required.' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dryRun === true

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'notifications@rekindlebc.com'
    const FROM_NAME = Deno.env.get('FROM_NAME') || 'ReKindle'
    const SITE_URL = (Deno.env.get('SITE_URL') || CONSUMER_URL).replace(/\/+$/, '')
    const UNSUBSCRIBE_SECRET = Deno.env.get('UNSUBSCRIBE_SECRET')
    if (!dryRun && (!RESEND_API_KEY || !UNSUBSCRIBE_SECRET || UNSUBSCRIBE_SECRET === 'changeme')) {
      return json({ error: 'Email is not configured (RESEND_API_KEY / UNSUBSCRIBE_SECRET).' }, 500)
    }

    const { data: rows, error } = await supabase.from('shared_devotional_followups').select('*')
      .is('processed_at', null).order('created_at', { ascending: true }).limit(BATCH)
    if (error) throw error

    const { data: linkSetting } = await supabase.from('platform_settings').select('value').eq('key', 'app_download_links').maybeSingle()
    let links: Row = {}
    try { links = typeof linkSetting?.value === 'string' ? JSON.parse(linkSetting.value) : (linkSetting?.value ?? {}) } catch { links = {} }
    const saved = !!linkSetting
    const storeLinks = (app: 'consumer' | 'ministry') => ({
      playStore: (saved ? links[`${app}PlayStore`] : DEFAULT_PLAY[app]) || '',
      appStore: (saved ? links[`${app}AppStore`] : '') || '',
    })

    const now = new Date()
    const results: Array<{ user_id: string; outcome: string }> = []
    const close = async (userId: string, outcome: string) => {
      results.push({ user_id: userId, outcome })
      if (!dryRun) {
        await supabase.from('shared_devotional_followups')
          .update({ processed_at: new Date().toISOString(), outcome }).eq('user_id', userId)
      }
    }

    for (const row of rows ?? []) {
      const opened = new Date(row.created_at)
      if (now.getTime() - opened.getTime() > EXPIRE_MS) { await close(row.user_id, 'expired'); continue }

      const { data: profile } = await supabase.from('user_profiles')
        .select('email, display_name, full_name, timezone, email_opt_in, consent_devotionals, created_at')
        .eq('user_id', row.user_id).maybeSingle()
      if (!profile?.email) { await close(row.user_id, 'skipped_no_email'); continue }
      if (profile.created_at && opened.getTime() - new Date(profile.created_at).getTime() > NEW_ACCOUNT_WINDOW_MS) {
        await close(row.user_id, 'skipped_existing_account'); continue
      }
      if (profile.email_opt_in === false || profile.consent_devotionals === false) {
        await close(row.user_id, 'skipped_no_consent'); continue
      }
      const { count: appTokens } = await supabase.from('push_tokens').select('id', { count: 'exact', head: true })
        .eq('user_id', row.user_id).eq('is_active', true).in('platform', ['android', 'ios'])
      if ((appTokens ?? 0) > 0) { await close(row.user_id, 'skipped_has_app'); continue }

      // The next calendar day, in the morning, where they are.
      const tz = profile.timezone || 'UTC'
      const openedLocal = localParts(opened, tz)
      const nowLocal = localParts(now, tz)
      if (nowLocal.date <= openedLocal.date || nowLocal.hour < SEND_FROM_HOUR || nowLocal.hour >= SEND_UNTIL_HOUR) {
        results.push({ user_id: row.user_id, outcome: 'waiting' })
        continue
      }

      const sharedTable = row.kind === 'ministry' ? 'ministry_devotionals' : 'devotionals'
      const { data: shared } = await supabase.from(sharedTable).select('*').eq('id', row.devotional_id).maybeSingle()
      const today = await todaysDevotional(supabase, row, shared, nowLocal.date)
      if (!today) { await close(row.user_id, 'skipped_no_devotional'); continue }

      let sourceName: string | null = null
      if (row.kind === 'ministry' && shared?.ministry_id) {
        const { data: g } = await supabase.from('ministry_groups').select('name').eq('id', shared.ministry_id).maybeSingle()
        sourceName = g?.name ?? null
      } else if (shared?.stream_id) {
        const { data: s } = await supabase.from('devotional_streams').select('name, is_default').eq('id', shared.stream_id).maybeSingle()
        sourceName = s && !s.is_default ? s.name : null
      }

      const app = row.app === 'ministry' ? 'ministry' : 'consumer'
      const origin = app === 'ministry' ? MINISTRY_URL : CONSUMER_URL
      const path = row.kind === 'ministry' ? 'ministry-devotional' : 'daily-devotional'
      const { playStore, appStore } = storeLinks(app)

      if (dryRun) { results.push({ user_id: row.user_id, outcome: `would_send:${today.title}` }); continue }

      const token = await unsubscribeToken(row.user_id, profile.email, UNSUBSCRIBE_SECRET!)
      const email = buildEmail({
        name: profile.display_name || profile.full_name?.split(' ')[0] || 'friend',
        sharedTitle: shared?.title || 'a devotional',
        sourceName,
        today: { title: today.title, url: `${origin}/${path}/${today.id}` },
        appName: app === 'ministry' ? 'ReKindleBC Ministry' : 'Rekindle',
        playStore,
        appStore,
        unsubscribeUrl: `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}&action=unsubscribe`,
      })
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [profile.email], subject: email.subject, html: email.html, text: email.text }),
      })
      if (res.ok) {
        await close(row.user_id, 'sent')
      } else {
        // Leave it pending so a later run in the same morning retries.
        console.warn('[shared-followup] send failed', row.user_id, res.status, await res.text().catch(() => ''))
        results.push({ user_id: row.user_id, outcome: `send_failed_${res.status}` })
      }
    }

    const summary = results.reduce<Record<string, number>>((acc, r) => {
      const key = r.outcome.startsWith('would_send') ? 'would_send' : r.outcome
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    console.log('[shared-followup] done', summary)
    return json({ dryRun, pending: rows?.length ?? 0, summary, ...(dryRun ? { results } : {}) })
  } catch (err) {
    console.error('[shared-followup] failed', err)
    return json({ error: (err as Error)?.message ?? String(err) }, 500)
  }
})
