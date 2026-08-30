-- 0295_translation_services_public_sel.sql
-- =====================================================================
-- /display now shows the service's name (not just the target language) at
-- the top of the page — TranslationDisplayPage.tsx joins
-- translation_sessions.service_id -> translation_services.name. That join
-- was previously impossible for an anon visitor: translation_services
-- (migration 0273) only granted select to authenticated ministry members/
-- admins, so a public /display visitor's read of the service row silently
-- returned nothing under RLS even though the session row itself was
-- readable.
--
-- Same NOT EXISTS(...is_public = false) shape as
-- p_translation_sessions_public_sel — a ministry with no language_configs
-- row yet still defaults to public, matching that policy's own reasoning.
-- =====================================================================

begin;

create policy p_translation_services_public_sel on public.translation_services
  for select to anon, authenticated
  using (
    not exists (
      select 1 from public.language_configs lc
      where lc.ministry_id = translation_services.ministry_id
        and lc.is_public = false
    )
  );

commit;
