-- Per-ministry Meta App Secret, for ministries who connected WhatsApp via
-- "Enter Credentials Manually" (their own separate Meta app) rather than
-- Embedded Signup (whose WABA lives under Rekindle's own app and is already
-- covered by the shared META_APP_SECRET). whatsapp-webhook needs this to
-- verify X-Hub-Signature-256 on a manually-connected ministry's inbound
-- messages — without it, those requests could only be logged-and-processed
-- unverified, meaning anyone who learned a ministry's phone_number_id could
-- inject fake inbound messages into their Evangelism Inbox.
--
-- Encrypted with the same AES-256-GCM scheme (ENCRYPTION_KEY) already used
-- for access_token_encrypted, so it never sits in the table as plaintext.
alter table public.ministry_whatsapp_configs
  add column if not exists app_secret_encrypted text;

comment on column public.ministry_whatsapp_configs.app_secret_encrypted is
  'AES-256-GCM encrypted Meta App Secret (Settings -> Basic in the ministry''s own Meta app), only set for manually-connected WABAs. NULL for Embedded Signup connections, which verify against the shared META_APP_SECRET instead.';
