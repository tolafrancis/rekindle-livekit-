# Phase 3 step 4 — Content-source model (ground truth + resolver)

**Status:** ✅ Resolver built (`@rekindle/features/contentSource`). Schema confirmed
via the Management API against `vpnpembyqbbaaiynfvli` on 2026-07-12.

## The three source patterns (live schema)
A church sees **global** content (yours, all-tenants) merged with its **own** content.
The live tables implement this three different ways:

| Pattern | Meaning | Content types |
|---|---|---|
| **`ministry_id` column** | one table; `NULL` row = global, set = ministry-owned | `declarations`, `devotional_series`, `prayer_series` |
| **paired tables** | a global table + a separate `ministry_*` table | `devotionals` ↔ `ministry_devotionals`; `prayer_library` ↔ `ministry_prayer_library` |
| **global-only** | no ministry ownership | `affirmations`, `book_summaries`, `prayer_points`, `prayer_topics` |

## Devotional streams (the [REV] reconciliation)
Devotionals also resolve by **stream** (global catalog):
- `devotional_streams` (id, name, description, cover_image_url, is_public, is_default, sort_order) — the global catalog.
- `devotionals.stream_id` — links a devotional to a stream.
- `ministry_devotional_settings` (ministry_id, **daily_devotional_stream_id**, updated_at) — the stream a church points its homepage at.
- `user_profiles.devotional_stream_id` — a member's personal stream choice (personal layer).

**Devotional resolution order:** stream-first (`ministry_devotional_settings` → `devotionals.stream_id`) → ministry's own (`ministry_devotionals`) → global (`devotionals`). Mirrors shipped `MinistrySpace`.

## content_mode ("our content only")
No `content_mode` column exists. Stored in **`ministry_groups.settings.content_mode`**
(`'blended'` default | `'own-only'`), surfaced on `MinistrySummary.contentMode` and
written by `setMinistryContentMode()`. `own-only` shows only ministry-owned rows;
global-only types yield nothing in that mode (they have no owned variant).

## Resolver API (`@rekindle/features/contentSource`)
- `CONTENT_SOURCES` — the registry above (pattern + tables per type).
- `fetchContent(type, { ministryId, mode, select })` — merged rows, `__source`-tagged.
- `fetchMinistryDevotionals(...)` — stream-first devotional resolution.
- `scopeByMinistry(query, ministryId, mode)` — filter primitive for `ministry_id` tables.
- `setMinistryContentMode()`, `useContentMode()`, `useContentSource()`.

## Feeds Phase 4 (RLS)
The content-source axis must be enforced in RLS, not just this client resolver: global
rows readable by all; `ministry_id` rows only by that tenant; `ministry_*` tables
tenant-scoped; `devotional_streams` global-readable but `ministry_devotional_settings`
tenant-scoped. See the two red flags in [3a-tenant-identity.md](3a-tenant-identity.md).
