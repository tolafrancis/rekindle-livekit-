-- 0148_meeting_ai_notes.sql
-- AI meeting notes: persist the transcript + generated insights so they survive the
-- session. Previously MeetingRecordingPanel held everything in React state and it
-- was lost the moment the panel closed (download was the only way to keep it).

create table if not exists public.meeting_ai_notes (
  id               uuid primary key default gen_random_uuid(),
  -- meeting_id is the meeting row id, or the broadcast id for a live broadcast.
  meeting_id       text        not null,
  source_table     text        not null
                   check (source_table in ('live_channel_video_meetings',
                                           'ministry_video_meetings',
                                           'channel_broadcasts')),
  meeting_title    text,
  created_by       uuid        not null references auth.users (id) on delete cascade,
  raw_transcript   jsonb,      -- { lines: [...], durationSeconds, detectedLanguages }
  transcript       jsonb,      -- cleaned transcript (CleanedTranscript)
  insights         jsonb,      -- MeetingInsights (summary, action items, decisions…)
  dominant_language text,
  duration_seconds integer,
  created_at       timestamptz not null default now()
);

create index if not exists idx_meeting_ai_notes_meeting
  on public.meeting_ai_notes (meeting_id, created_at desc);
create index if not exists idx_meeting_ai_notes_creator
  on public.meeting_ai_notes (created_by, created_at desc);

alter table public.meeting_ai_notes enable row level security;

-- The person who took the notes owns them. (Widen later if you want the meeting
-- host or all participants to read every set of notes for a meeting.)
drop policy if exists "own notes: select" on public.meeting_ai_notes;
create policy "own notes: select" on public.meeting_ai_notes
  for select using (auth.uid() = created_by);

drop policy if exists "own notes: insert" on public.meeting_ai_notes;
create policy "own notes: insert" on public.meeting_ai_notes
  for insert with check (auth.uid() = created_by);

drop policy if exists "own notes: update" on public.meeting_ai_notes;
create policy "own notes: update" on public.meeting_ai_notes
  for update using (auth.uid() = created_by);

drop policy if exists "own notes: delete" on public.meeting_ai_notes;
create policy "own notes: delete" on public.meeting_ai_notes
  for delete using (auth.uid() = created_by);
