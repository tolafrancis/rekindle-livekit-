-- 0285_fix_pgcrypto_search_path.sql
-- =====================================================================
-- Real bug found live (2026-08-21): registering a translation device
-- failed with "function gen_random_bytes(integer) does not exist".
--
-- Root cause: `pgcrypto` lives in the `extensions` schema on this
-- Supabase project (its standard default) — migration 0273's plain
-- `create extension if not exists pgcrypto;` didn't change that, since
-- the extension already existed there. Every SECURITY DEFINER function
-- in that migration correctly hardens itself with `set search_path =
-- public` (a real, deliberate security measure — prevents a
-- search-path-hijacking attack against a SECURITY DEFINER function),
-- but that same restriction makes `gen_random_bytes`, `crypt`,
-- `gen_salt`, and `digest` all unreachable by their bare names, since
-- none of them live in `public`.
--
-- This isn't just the one function the report was about — every
-- function in 0273 that touches pgcrypto has the identical gap:
--   - register_translation_device  (gen_random_bytes, crypt, gen_salt)
--   - authenticate_device          (crypt)
--   - _translation_device_from_token (digest)
--   - device_heartbeat             (via _translation_device_from_token)
--   - set_display_pin              (crypt, gen_salt)
--   - verify_display_pin           (crypt)
-- The last two mean the /display PIN privacy gate has been silently
-- broken the same way since 0273 shipped — a ministry trying to set or
-- check a PIN would have hit this same error, just never reported
-- because most testing this session used public (no-PIN) channels.
--
-- Fix: add the (fixed, non-writable) `extensions` schema to each
-- function's search_path — same hardening intent as before, `crypt()`
-- can now resolve to `extensions.crypt()` without opening the function
-- up to anything user-writable. ALTER FUNCTION ... SET search_path
-- only touches the function's config, not its body, so this doesn't
-- need to restate any of the six functions' logic.
-- =====================================================================

begin;

alter function public.register_translation_device(uuid, text)
  set search_path = public, extensions;

alter function public.authenticate_device(text)
  set search_path = public, extensions;

alter function public._translation_device_from_token(text)
  set search_path = public, extensions;

alter function public.device_heartbeat(text)
  set search_path = public, extensions;

alter function public.set_display_pin(uuid, text)
  set search_path = public, extensions;

alter function public.verify_display_pin(uuid, text)
  set search_path = public, extensions;

commit;
