-- 0156_ministry_domains.sql
-- =====================================================================
-- Phase 6 (6d) — domain model + hostname resolver foundation (credential-free;
-- Cloudflare-for-SaaS provisioning is separate). Two tiers, one resolver:
--   Tier 1 subdomain (free)   -> ministry_groups.slug  (church.yourproduct.com)
--   Tier 2 custom domain (paid) -> ministry_groups.white_label_domain
-- Reuses existing columns; adds only domain_status + a public-safe lookup RPC.
-- =====================================================================

begin;

-- Lifecycle for a custom domain: none | pending | verifying | active | error.
alter table public.ministry_groups
  add column if not exists domain_status text not null default 'none';

-- Public-safe hostname -> ministry resolver. SECURITY DEFINER so the ministry app can
-- resolve which tenant a subdomain/custom-domain maps to WITHOUT exposing ministry_groups
-- (base table is member-scoped since 0154). Returns only non-PII branding fields.
create or replace function public.get_ministry_by_hostname(p_host text)
returns table (
  id uuid, name text, slug text, logo_url text, banner_url text,
  theme_color text, is_active boolean, domain_status text
)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.name, g.slug, g.logo_url, g.banner_url,
         g.theme_color, g.is_active, g.domain_status
  from public.ministry_groups g
  where g.is_active = true
    and (
      -- custom domain match (full hostname), or subdomain match (first label)
      lower(g.white_label_domain) = lower(p_host)
      or lower(g.slug) = lower(split_part(p_host, '.', 1))
    )
  order by (lower(g.white_label_domain) = lower(p_host)) desc  -- prefer exact custom domain
  limit 1;
$$;

grant execute on function public.get_ministry_by_hostname(text) to anon, authenticated;

commit;

-- Cloudflare-for-SaaS custom-hostname provisioning (create/verify/activate) writes
-- domain_status (pending->verifying->active) via an edge function using the CF API —
-- deferred until keys are provided. Subdomains (slug) need no provisioning (wildcard).
