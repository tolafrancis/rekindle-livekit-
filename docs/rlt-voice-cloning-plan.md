# RLT: Per-Language Voices, Cloning & Multi-Provider TTS — Build Plan

Status: **planning only, nothing implemented yet.**

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

### Phase 2 — Voice cloning

This only adds **how a `voice_id` gets created**; everything from Phase 1 (the
table, the picker, the bot lookup) is reused unchanged.

**Whose voice gets cloned — needs a decision before building anything:**
- The host/pastor's own real voice — most natural/resonant for the congregation,
  but this is cloning an identifiable real person's voice, which raises real
  consent questions (see Risks).
- A chosen "house narrator" voice, cloned once and reused across services —
  lower-stakes, easier to consent-cover once.

Either way the mechanism is identical; only the source recording differs.

**Sample capture.** Two reasonable options, not mutually exclusive:
- Let an admin upload an existing clean recording (e.g. trim a clip from a past
  sermon) — fastest to build, but sample quality is whatever they happen to have.
- A short guided "read this script for ~60 seconds" in-browser recording flow
  (plain `getUserMedia` audio capture) — guarantees a clean, single-speaker
  sample, better clone quality, more setup work.
  Start with upload for v1; add guided recording later if clone quality from
  uploaded clips isn't good enough in practice.

**Cloning call.** Bot-side (or a small Edge Function — doesn't need to run on
the always-on bot process since it's a one-time action, not a live-session
step): send the captured sample to the TTS provider's voice-cloning endpoint,
get back a `voice_id`, write it into `translation_voices` via the same RPC as
Phase 1, tagged `is_cloned = true`.

**Consent — this is a policy/legal item, not just an engineering task.** Cloning
someone's actual voice is closer to biometric data than a normal upload in a lot
of jurisdictions. Before this ships, there should be an explicit, recorded
consent step (a checkbox alone is thin — consider a short spoken/typed consent
statement captured alongside the sample) from the person being cloned, and a
clear deletion path (removing the voice from `translation_voices` should also
call the provider's delete-voice endpoint, not just hide it in the UI).

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

1. Phase 1 (per-language voice selection) — ships value immediately even before
   cloning or FPT exist, and is the foundation everything else sits on.
2. Get FPT's real-time-tier API reference and run the throwaway latency/format
   spike (first task in Phase 1b) — this determines whether Phase 1b is even
   viable as designed before any real code is written against it.
3. Settle the consent/policy question for cloning while 1 and 2 are underway —
   don't block engineering on it, but don't skip it either.
4. Phase 1b (FPT + fallback for Vietnamese), once the spike confirms it's viable.
5. Phase 2 (cloning), starting with upload-based sample capture.
6. Phase 3 (nicer voice management UI) once the above are live and proven with
   at least one real ministry.
