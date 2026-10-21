-- 0412_app_testimonials.sql
-- =====================================================================
-- Testimonials about ReKindle BC itself, shown on the landing page.
-- Anyone (including signed-out visitors) submits one from /testimonial;
-- it stays hidden until a platform admin publishes it from Platform admin
-- > Testimonials. Visitors only ever read published rows.
-- =====================================================================

create table if not exists public.app_testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  role text check (role is null or char_length(role) <= 120),
  quote text not null check (char_length(quote) between 10 and 600),
  consent boolean not null default false,
  is_published boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_app_testimonials_published on public.app_testimonials (is_published, display_order);

alter table public.app_testimonials enable row level security;

drop policy if exists p_app_testimonials_public_read on public.app_testimonials;
create policy p_app_testimonials_public_read on public.app_testimonials
  for select to anon, authenticated
  using (is_published or public.is_platform_admin(auth.uid()));

-- Submissions always arrive hidden, and only with permission to publish.
drop policy if exists p_app_testimonials_submit on public.app_testimonials;
create policy p_app_testimonials_submit on public.app_testimonials
  for insert to anon, authenticated
  with check (consent and not is_published);

drop policy if exists p_app_testimonials_admin_update on public.app_testimonials;
create policy p_app_testimonials_admin_update on public.app_testimonials
  for update to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists p_app_testimonials_admin_delete on public.app_testimonials;
create policy p_app_testimonials_admin_delete on public.app_testimonials
  for delete to authenticated
  using (public.is_platform_admin(auth.uid()));

grant select, insert on public.app_testimonials to anon, authenticated;
grant update, delete on public.app_testimonials to authenticated;
