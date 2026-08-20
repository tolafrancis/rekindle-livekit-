# RLT: Per-Language Voices, Cloning & Multi-Provider TTS — Build Plan

Status (2026-08-21): **Phase 1 shipped and live** (per-language voice
selection, real voice picker with preview — upgraded from the original
bare-ID-field version after real feedback). **Phase 2 (cloning) shipped
and live** — schema, Edge Functions, and UI all deployed; consent is
handled outside this app entirely (explicit product decision), and
support-either-voice (pastor's own or a house narrator) was chosen over
picking one. **Phase 3 (re-record/replace an existing clone) shipped and
live. Phase 3b (voice library search + add-to-account) shipped and live**
— real gap found live: the account's own catalog had almost no non-English
voices, so languages like Vietnamese had nothing to select; this searches
the provider's actual library by language and pulls a match into the
account. **Phase 1b (FPT) dropped.** All phases in this plan are closed.

## Phase 3b — voice library search (2026-08-21)

**Why this exists.** After Phase 1 shipped, testing surfaced that the
picker had almost nothing for non-English languages — Vietnamese included.
Root cause, confirmed against the provider's own docs, not guessed: the
picker's catalog (`GET /v2/voices`) only ever returns voices already sitting
in *this account's own collection* — it was never meant to be the full
catalog. The actual library of voices in every language lives at a
**separate** endpoint, `GET /v1/shared-voices`, filterable by `language`
directly. A voice found there has to be explicitly added
(`POST /v1/voices/add/{public_owner_id}/{voice_id}`, which mints a brand
new voice_id in the account) before it shows up in the regular catalog.

**What shipped:**
- `translation-search-voice-library` — proxies the shared-library search,
  filterable by language. Read-only against public data, so only requires
  being signed in, not ministry membership.
- `translation-add-library-voice` — admin-gated, adds a chosen library
  voice into the account and records it in `translation_custom_voices`
  (`is_cloned = false` — "added from the library," not "cloned from our
  own sample," though both are handled identically everywhere downstream).
- Settings UI: a collapsible "Browse the voice library" panel inside
  Custom Voices — search by language code, preview, one-click add.
- **Ministry-scoping filter widened** (`translation-list-voices`): library-
  added voices commonly land in categories (`famous`, `high_quality`) the
  original Phase 2 filter didn't account for — it only excluded
  `cloned`/`generated`/`professional`. Now only `premade` (the provider's
  own always-present defaults) is shown to every ministry unconditionally;
  every other category requires the voice to be in the CALLING ministry's
  own `translation_custom_voices`. Caught and fixed before this shipped,
  not discovered as a leak afterward.
- **Schema correction, unrelated bug caught in passing:** `create_custom_voice`
  never actually accepted an `is_cloned` value — every row (Phase 2's real
  clones included) had silently defaulted to `false` in the database
  column since that migration shipped. Harmless (nothing read that column
  directly — the picker computes its own `is_cloned` client-side from
  ministry ownership), but wrong, and now actually matters with two
  different creation paths writing into the same table. Fixed (migration
  0284) alongside this phase.

**Known caveat, not yet hit:** the provider's docs note Voice Library
access via the API isn't available on the free tier. Untested against
this account's actual plan — if it turns out to be gated, the search
function will surface a clear `provider_error` rather than fail silently.

## Phase 1b — closed, not built

Confirmed directly against FPT's own console documentation (pasted by the
user, not just the public docs found earlier) that the only TTS product FPT
offers — account or no account — is the async v5 REST API: 5 seconds to 2
minutes per request, unpredictable, MP3/WAV only, no streaming. A follow-up
search (general web, FPT's own docs site index, Vietnamese-market terms,
SDK/WebSocket/gRPC-specific terms) turned up no separate real-time/streaming
product anywhere discoverable. That rules this out structurally for live,
per-utterance translation — not a tuning problem, a product-shape problem.

Decision: drop Phase 1b rather than build integration code against a product
that can't serve the live path. If FPT genuinely has a faster tier, it would
need to come from a direct conversation with their sales/support, not
anything visible in the self-serve console.

**Good Vietnamese voice quality is still achievable without FPT** — Phase 1's
per-language voice picker lets Vietnamese use its own dedicated voice, and
Phase 2's cloning can produce a real Vietnamese speaker's voice for it, both
already live. Worth judging quality directly against those before concluding
anything is still missing.

An `FPT_API_KEY` secret was set on the Supabase project for this — nothing
reads it now that this phase is dropped; harmless to leave or remove.

## First: what "Default speaker identity" actually is

This came up as confusing, so before anything else — it has **nothing to do with
voice selection**. It's a field in Ministry → Translation Settings:

> LiveKit participant identity the bot subscribes to by default. Leave blank to
> auto-detect the first active speaker.

The translation bot listens to one person's microphone as the *source* audio —
whoever it's translating. When a meeting/broadcast has multiple participants
(e.g. a host plus a co-host or interpreter), the bot needs to know **whose mic
to listen to**. Left blank, it just picks whoever starts talking first, which is
fine for a single-speaker sermon but can pick the wrong person in a multi-person
room. Filling it in with a specific participant ID pins the bot to always
translate that one person, regardless of who else is in the room or talking.

It is not a voice, not a language, and not related to TTS at all — it's purely
"whose audio goes IN to the pipeline," where this document is about "whose voice
comes OUT."

## Current architecture (as it actually is today)

Traced directly from the bot's source, not assumed:

```
Host mic (LiveKit room)
   │
   ▼
Speech-to-text (streaming, per-utterance)
   │
   ▼
Translation (LLM chat completion, one call per finished utterance)
   │
   ▼
Text-to-speech (streaming synthesis, given a voice ID)
   │
   ▼
Translated audio published back into the LiveKit room
  (picked up by BroadcastTranslationButton / the meeting translation picker)
```

Key facts about the current TTS step, specifically:

- **One voice ID per ministry, full stop.** `language_configs`' existing voice
  ID column is a single value set once in Ministry → Translation Settings. Every target
  language that ministry runs — Vietnamese, Korean, Chinese, whatever — is
  spoken in that same one voice. There is currently no way to pick a different
  voice per language.
- **No cloning capability exists yet.** The voice ID field is a free-text input;
  an admin has to already know a valid voice ID from the provider's own
  dashboard and paste it in. There's no in-app way to create a new voice at all.
- The voice ID is looked up **once per session**, purely by `ministry_id`, and
  handed to that session's pipeline. The pipeline itself has no concept of
  "which voice for which language" — it just gets told one ID and uses it.
- The TTS step is a single call per finished utterance, given `(text, voice_id)`,
  returning ready-to-play audio. Whatever "voice" is corresponds to nothing more
  than which ID is passed into that one call — which is exactly why per-language
  voices and cloned voices turn out to be the *same* underlying mechanism (see
  below), not two separate features.

## What you're asking for

1. **Per-language voice selection** — Vietnamese speaks in one voice, Korean in
   another, etc., instead of one voice for everything.
2. **Voice cloning** — create a custom voice (most likely: the pastor's own
   voice, or a chosen "house narrator") and use it for the translated speech.
3. **Multi-provider TTS for Vietnamese** — FPT as the primary voice for
   Vietnamese specifically, with automatic fallback to the provider already in
   use today if FPT is unreachable or its subscription is exhausted.

## The key insight: these are the same mechanism, twice

The pipeline doesn't care *how* a voice ID came to exist — a stock voice picked
from the provider's catalog and a freshly cloned voice are indistinguishable to
the code that calls TTS. That means:

- Cloning is not a new runtime pipeline. It's a **one-time setup step** that
  produces a voice ID, which then flows through the exact same "voice ID → TTS
  call" path a stock voice already uses.
- Building per-language voice *selection* first, generically (works with any
  voice ID, cloned or not), gets you both features. Cloning just becomes "one
  more way to obtain a voice ID to plug into that same selector."

So the plan below builds the generic capability first, then adds cloning as an
input method on top of it — not as a separate system.

## Proposed build, in phases

### Phase 1 — Per-language voice selection (foundation, do this first)

**Data model.** New table, e.g. `translation_voices`:

| column | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `ministry_id` | uuid | fk |
| `target_language` | text | e.g. `vi`, `ko` |
| `voice_id` | text | the provider's voice identifier |
| `voice_label` | text | human-readable name shown in the UI, e.g. "Pastor's voice (cloned)" |
| `is_cloned` | boolean | for the UI to badge it distinctly; no behavioral difference to the pipeline |
| `created_at`, `created_by` | | |

Unique on `(ministry_id, target_language)` — one active voice per language per
ministry (nothing stops adding a "pick from several" feature later; this keeps
v1 simple). `language_configs`' existing ministry-wide voice ID column stays
exactly as-is and becomes the **fallback** when a language has no specific
entry here — zero risk to what already works, this is purely additive.

**New RPC:** `upsert_language_voice(p_ministry_id, p_target_language, p_voice_id, p_voice_label)`
— same pattern as the existing `upsert_language_config`.

**Bot change (small, isolated):** the existing ministry-wide voice lookup
function becomes `getVoiceId(ministryId, targetLanguage)` — look up
`translation_voices` for that exact pair first, fall back to the ministry-wide
default, fall back to the hardcoded placeholder. `BotSession.ts` already has
`targetLanguage` in scope when it currently calls the ministry-wide lookup, so
this is a one-line change at the call site plus the new lookup function.

**UI change:** in Ministry → Translation Settings, next to each entry in
"Supported target languages," add a small voice picker (a text input like the
existing one is the minimum viable version; a proper `Select` populated from the
provider's list-voices API is nicer but is its own small sub-task — see Phase 3).

**Effort:** small. One table, one RPC, one bot lookup function, one UI section.
No changes to STT, translation, session lifecycle, or anything real-time-path
related — this only touches which ID gets passed into the existing TTS call.

### Phase 1b — Multi-provider TTS with automatic fallback (Vietnamese primary)

**Why.** FPT is a Vietnamese-market TTS provider and is very likely to sound
more natural and locally accurate for Vietnamese than a general multilingual
voice ever will. The goal: Vietnamese speaks through FPT by default, with the
provider already in use today kept as an automatic fallback if FPT's
subscription runs out or it's unreachable — best available quality for the
primary use case, without a single point of failure.

**Important thing found while researching this, not assumed:** FPT's *public*
TTS API is asynchronous — you submit text and get a link to a finished audio
file back, with their own docs stating a 5-second-to-2-minute wait depending
on text length, and no documented streaming/low-latency variant or raw-PCM
output. That's unusable for a live, utterance-by-utterance pipeline as-is.
This plan assumes access to a faster, real-time-capable tier of FPT
(confirmed available) — **the first concrete task in this phase is getting
that tier's actual API reference and confirming its real turnaround time and
output format with a small throwaway test script, before wiring it into
anything live.** Same discipline as everywhere else in this project: verify
the real behavior directly rather than build on an assumption.

**Provider abstraction.** Right now the TTS step is one hardcoded call to one
provider's HTTP API. This becomes a small interface — roughly
`interface TtsProvider { synthesize(text, voiceId): Promise<Buffer | null> }`
— with one implementation per provider. The existing provider's code moves
behind this interface with **zero behavior change**; a new implementation is
added for FPT. `AudioPipeline` stops calling a
provider's API directly and instead calls whichever `TtsProvider` the current
voice config resolves to.

**Schema (extends Phase 1's `translation_voices` table):**

| new column | notes |
|---|---|
| `provider` | which TTS provider `voice_id` belongs to — FPT, or the provider already in use today |
| `fallback_provider` | nullable — set only where a fallback should be tried |
| `fallback_voice_id` | nullable — the voice to use on the fallback provider |

For Vietnamese specifically: `provider` = FPT,
`fallback_provider`/`fallback_voice_id` = today's existing provider/voice.
Every other language is untouched (no `fallback_provider` set = no fallback
logic runs at all for them — this only activates where configured).

**Fallback logic — the actual engineering, worth getting right:**
- **Per-session circuit breaker, not per-utterance retry.** Try the primary
  provider; if it fails (bad response, timeout, an explicit
  quota/auth-type error), mark that provider "down for the rest of this
  session" immediately and use the fallback for every subsequent utterance.
  Retrying the primary on every single sentence while it's down would tack a
  doomed extra round-trip's worth of latency onto every remaining utterance
  in a live sermon — exactly the kind of self-inflicted latency this whole
  project has spent a long time chasing out of the video/audio path already.
- Optionally, on a long broadcast: re-check the primary once after a cooldown
  (e.g. a few minutes) in case a transient outage cleared, rather than staying
  on the fallback for the rest of a multi-hour service unnecessarily.
- Distinguish failure types where possible: a clearly-wrong credential or
  persistent auth failure is a configuration bug worth surfacing loudly (a log
  line severe enough to actually get noticed), not something that should just
  silently degrade every service to the fallback voice without anyone knowing.
- This slots into the *existing* per-utterance step in the promise chain that
  already guarantees utterances play in order — provider selection just
  decides which HTTP call that step makes, no new architecture needed there.

**Observability.** Log which provider actually served each utterance (e.g. a
`provider_used` column alongside the existing `translation_logs` entry) so
it's possible to see how often the fallback is actually triggering in a real
service, instead of guessing.

### Phase 2 — Voice cloning ✅ shipped (2026-08-21)

This only adds **how a `voice_id` gets created**; everything from Phase 1 (the
table, the picker, the bot lookup) is reused unchanged.

**Decisions made:**
- **Whose voice gets cloned:** support both — a ministry can clone the
  host/pastor's own voice or a chosen "house narrator," decided per-ministry,
  not fixed platform-wide.
- **Consent:** handled outside this app entirely (explicit product decision) —
  no in-app consent-capture flow was built. The app still enforces one boundary
  regardless: a cloned voice is only ever visible/usable by the ministry that
  created it (see below) — letting every tenant on the shared TTS account
  freely use a voice cloned under a DIFFERENT ministry's external consent
  process would undermine that consent no matter how it was obtained.

**What actually got built:**
- `translation_custom_voices` table (migration 0282) — tracks a ministry's own
  cloned voices independent of whatever language they're currently assigned to,
  so they can be listed/deleted on their own.
- `translation-voice-samples` storage bucket, private, upload scoped to
  ministry admins via `storage.foldername(name)[1] = ministry_id` +
  `is_group_admin`.
- `translation-clone-voice` Edge Function — admin-authorization checked
  *before* the costly provider call (cloning isn't free), downloads the
  uploaded sample server-side, calls the provider's instant-voice-clone
  endpoint, writes the result into `translation_custom_voices` via
  `create_custom_voice`.
- `translation-delete-custom-voice` Edge Function — deletes from the provider,
  clears the voice from any language it's currently assigned to first (so a
  deleted voice never leaves a language silently pointing at a voice_id that
  no longer exists), then removes the local row and the stored sample.
- `translation-list-voices` (from Phase 1) updated to take a `ministryId` and
  filter the shared provider account's catalog down to stock voices + this
  ministry's own clones — a real gap caught during Phase 2 build, not present
  in the original Phase 1 version, which showed the whole account's catalog
  to every ministry indiscriminately.
- Settings UI: a "Custom Voices" panel — upload a sample + name it + clone,
  list existing clones with delete, all reusing the Phase 1 voice picker for
  actually assigning a clone to a language.
- Sample capture: upload-only for v1, as planned (guided in-browser recording
  was flagged as a later improvement, not built yet).

### Phase 3 — Voice management UI (optional, do after 1 and 2 are proven)

- A small panel listing a ministry's configured/cloned voices, with the ability
  to re-record/replace, delete (calls provider delete too), and audition
  (type sample text, hear it played back) before assigning it to a language.
- Proper `Select`-based voice picker (fetch + cache the provider's voice
  catalog) instead of Phase 1's free-text ID field.

## Risks / open questions to flag now, not discover live

- **Consent is the real risk here, not the engineering.** Get this settled
  before building the cloning UI, not after.
- **Cross-lingual quality is not guaranteed.** A voice cloned from an English
  sample doesn't automatically sound equally natural speaking Vietnamese or
  Korean — this varies by provider and by voice, and needs an actual listening
  test per target language once built, not an assumption.
- **Provider account limits.** Most TTS platforms cap how many stored/cloned
  voices an account can hold at a given plan tier. If several ministries each
  clone voices for several languages, that total needs monitoring — check the
  actual limit on the account in use before promising this broadly.
- **Cost model.** Voice *creation* (the cloning operation) is typically a
  one-time-per-voice action, separate from the per-character cost of ongoing
  synthesis — confirm both numbers against the actual account/plan before
  this goes further, rather than assuming either is negligible.
- **None of this touches the real-time pipeline's latency.** STT, translation,
  and the TTS call itself are unchanged — a cloned voice ID flows through the
  exact same synthesis call a stock voice does today. This plan does not
  introduce new buffering, new services, or new round-trips into the live path.
- **FPT's real-time tier's actual behavior is still unverified.** Everything in
  Phase 1b is designed around it, but nothing about its real latency, output
  format, or failure/quota-error responses is confirmed yet — that's first on
  the list for a reason, not a footnote.
- **A wrong or flaky primary provider must fail fast, not fail slow.** If the
  circuit-breaker logic in Phase 1b isn't right, a struggling primary provider
  could add a full timeout's worth of delay to the first few utterances of a
  session before falling back — worth deliberately testing a simulated outage,
  not just the happy path, before this goes live.

## Suggested order of work

1. ✅ Phase 1 (per-language voice selection) — shipped.
2. ~~Get FPT's real-time-tier API reference and run the throwaway latency/format
   spike~~ — done; confirmed no viable product exists. Phase 1b dropped.
3. ✅ Phase 2 (cloning) — shipped, upload-based sample capture as planned.
4. ✅ Phase 3 (voice management UI) — shipped (2026-08-21). Re-record/replace
   for an existing cloned voice, confirmed against the TTS provider's actual
   edit-voice endpoint (POST `/v1/voices/{voice_id}/edit`) — it keeps the
   same external voice_id when new samples are submitted, so every language
   currently assigned to that voice stays correctly assigned; nothing to
   clear or reassign, unlike a delete. Picking a replacement file uploads it,
   calls the provider's edit endpoint instead of create, updates the
   existing `translation_custom_voices` row (`update_custom_voice`,
   migration 0283) instead of inserting a new one, and cleans up the old
   sample from storage. The other originally-listed item (a `Select`-based
   catalog picker) wasn't pursued — the existing Popover-based picker
   already does preview/audition, which a native `Select` can't support
   well anyway, so it's a strict downgrade, not an upgrade.

All phases from this plan are now closed (1, 2, 3 shipped; 1b dropped).
