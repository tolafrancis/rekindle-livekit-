-- 0338_developer_api_meetings.sql
-- =====================================================================
-- External "Interactive Meetings" API — lets any signed-in user (not just
-- ministries) mint a developer API key and create/manage LiveKit meetings
-- from their own third-party integration, without going through the app UI.
--
-- Two tables:
--   developer_api_keys — one row per issued key. Only a SHA-256 hash of the
--     key is stored; the plaintext is shown once at creation time (by the
--     developer-api-keys function) and never persisted.
--   api_meetings — meetings created through the external API. Deliberately
--     separate from live_channel_video_meetings / ministry_video_meetings:
--     those are coupled to channels/ministries and their plan-gating UI;
--     third-party callers shouldn't need a channel to use this API.
-- =====================================================================

begin;

create table if not exists public.developer_api_keys (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  label          text not null default 'API Key',
  key_prefix     text not null,        -- first chars of the key, for display only (e.g. "rkm_live_ab12cd34")
  key_hash       text not null unique, -- sha256(full key), hex-encoded
  last_used_at   timestamptz,
  request_count  bigint not null default 0,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists developer_api_keys_owner_idx on public.developer_api_keys(owner_user_id);
create index if not exists developer_api_keys_hash_idx on public.developer_api_keys(key_hash) where revoked_at is null;

create table if not exists public.api_meetings (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references auth.users(id) on delete cascade,
  api_key_id         uuid references public.developer_api_keys(id) on delete set null,
  title              text not null,
  description        text,
  mode               text not null default 'meeting' check (mode in ('meeting')), -- webinar/HLS not yet supported via the external API
  room_name          text not null unique,
  duration_minutes   int not null default 60,
  max_participants   int not null default 50,
  enable_recording   boolean not null default false,
  is_active          boolean not null default false,
  metadata           jsonb not null default '{}'::jsonb, -- caller-supplied passthrough (e.g. their own external_id)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  started_at         timestamptz,
  ended_at           timestamptz
);

create index if not exists api_meetings_owner_idx on public.api_meetings(owner_user_id);

alter table public.developer_api_keys enable row level security;
alter table public.api_meetings enable row level security;

-- developer_api_keys: only the owner (via the developer-api-keys function, which
-- runs with the user's own JWT) or service_role (the meetings-api function) may
-- touch a key. No direct client inserts/updates — key issuance always goes
-- through the function so the plaintext key is generated & hashed server-side.
create policy "Owner can view own api keys"
  on public.developer_api_keys for select
  using (auth.uid() = owner_user_id or auth.role() = 'service_role');

create policy "Service role manages api keys"
  on public.developer_api_keys for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- api_meetings: owner can read their own rows (e.g. from an in-app "API meetings"
-- view); all writes go through meetings-api under service_role.
create policy "Owner can view own api meetings"
  on public.api_meetings for select
  using (auth.uid() = owner_user_id or auth.role() = 'service_role');

create policy "Service role manages api meetings"
  on public.api_meetings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

commit;
