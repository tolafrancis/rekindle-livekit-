-- 0157_affirmations_ministry_ownership.sql
-- =====================================================================
-- Phase 7 — give a church its OWN affirmations, mirroring declarations (0151 B1).
-- Until now `affirmations` was global-only (contentSource.ts pattern 'global_only').
-- Adding a nullable ministry_id (NULL = ReKindle global, set = ministry-owned) lets a
-- ministry leader author affirmations shown only inside their ministry, and lets the
-- per-feature content-source toggle pick ReKindle / own / both.
--
-- Read model (mirrors declarations): global rows (ministry_id IS NULL) readable per
-- their published flag; ministry-owned rows readable only by is_group_member, writable
-- by is_group_admin; global rows writable by content admins.
--
-- Depends on is_group_member/is_group_admin (0150) + is_content_admin (0151). Idempotent.
-- =====================================================================

begin;

alter table public.affirmations
  add column if not exists ministry_id uuid references public.ministry_groups(id) on delete cascade;

create index if not exists idx_affirmations_ministry_id on public.affirmations(ministry_id);

-- Replace the permissive read policies (two public SELECT-all + one authenticated
-- SELECT-all) and the global admin write policies with the global-vs-ministry model.
drop policy if exists "Anyone can read affirmations" on public.affirmations;
drop policy if exists affirmations_read on public.affirmations;
drop policy if exists affirmations_select_all on public.affirmations;
drop policy if exists affirmations_insert_admin on public.affirmations;
drop policy if exists affirmations_update_admin on public.affirmations;
drop policy if exists affirmations_delete_admin on public.affirmations;

create policy p_affirmations_global_read on public.affirmations for select to public
  using (ministry_id is null and coalesce(is_published, true) = true);
create policy p_affirmations_ministry_read on public.affirmations for select to authenticated
  using (ministry_id is not null and public.is_group_member(ministry_id, auth.uid()));
create policy p_affirmations_ministry_write on public.affirmations for all to authenticated
  using (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()))
  with check (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()));
create policy p_affirmations_global_write on public.affirmations for all to authenticated
  using (ministry_id is null and public.is_content_admin(auth.uid()))
  with check (ministry_id is null and public.is_content_admin(auth.uid()));

commit;
