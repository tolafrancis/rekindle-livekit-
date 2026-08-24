# BUILD PLAN: Nigerian English STT Optimization for High-Fidelity Translation

## PRIMARY OBJECTIVE
The purpose of this project is to improve the accuracy of the English source transcript before translation.

This is critical because the current pipeline is:

Nigerian English speech
→ Deepgram STT
→ English transcript
→ GPT-4o translation
→ ElevenLabs TTS

The English transcript is the source of truth for translation.

If Deepgram incorrectly transcribes:

> "Let us praise God"
as:

> "Let us press God"

GPT-4o may receive "press God" as legitimate English and produce an incorrect or unnatural translation.

Therefore:

### PRIMARY GOAL
Produce the most semantically faithful English transcript possible from Nigerian-accented English preaching.

The goal is NOT to make the transcript grammatically prettier.
The goal is NOT to summarize the sermon.
The goal is NOT to paraphrase the pastor.
The goal is:

> Capture what the speaker actually said, while correcting only highly probable speech-recognition errors.

---

# TARGET ARCHITECTURE
The target pipeline should become:

```text
Nigerian English Speech
        ↓
Deepgram Nova-3 STT
        ↓
English Transcript
        ↓
Deterministic STT Corrections
        ↓
Contextual STT Verification
        ↓
Accurate English Transcript
        ↓
GPT-4o Translation
        ↓
Translated Text
        ↓
ElevenLabs TTS
        ↓
Audio
```

The correction stage must happen before translation.

Do NOT use the translation model as the primary STT correction mechanism.

---

# PHASE 0 — INSPECT THE EXISTING SYSTEM
Before changing anything:

1. Read the complete `AudioPipeline.ts`.
2. Read `config.ts`.
3. Find every Deepgram initialization.
4. Find every Deepgram `listen.live()` call.
5. Identify the current model.
6. Identify the current language configuration.
7. Identify how English is detected.
8. Identify auto-detect behavior.
9. Identify all Deepgram streaming parameters.
10. Identify how interim transcripts are handled.
11. Identify how final transcripts are handled.
12. Identify how `speech_final` is handled.
13. Identify where transcripts enter GPT-4o.
14. Identify where GPT-4o translation occurs.
15. Identify where translated text enters ElevenLabs.
16. Check whether any transcript correction currently exists.
17. Check the exact installed `@deepgram/sdk` version.
18. Check whether the installed SDK supports Nova-3 Keyterm Prompting.

DO NOT modify code during this phase.

First report the current architecture and the exact files/functions that will be changed.

Current verified findings from the codebase:

- Active live Deepgram integration is in the sibling translation bot repo, not in this monorepo app itself.
- The live bot file is: `rekindle-translation-bot/src/AudioPipeline.ts`.
- The key initialization is in `AudioPipeline.start()`.
- The Deepgram SDK dependency is `@deepgram/sdk` at version `^3.9.0` in the sibling bot `package.json`.
- The live STT stream is created via `client.listen.live({...})`.
- The current runtime model selection is:
  - `model: isAutoDetect ? 'nova-3' : 'nova-2'`
  - `language: isAutoDetect ? 'multi' : this.mapToDeepgramLanguageCode(this.opts.sourceLanguage)`
- For explicitly selected English, the code currently still uses the non-auto branch: `nova-2` and a code like `en` rather than `en-US`.
- The app continues supporting multilingual behavior via `language: 'multi'` for auto-detect sessions.
- Final transcripts are processed by `this.enqueue(text, detectedLanguage)` and then translated in `translateAndSpeak()`.
- `translateAndSpeak()` calls GPT-4o translation and then ElevenLabs synthesis.
- There is no transcript correction layer currently in the pipeline before translation.

---

# PHASE 1 — CHANGE ENGLISH STT FROM NOVA-2 TO NOVA-3
For known English sessions, change:

```ts
model: "nova-2"
```

to:

```ts
model: "nova-3"
```

Do not change unrelated language configurations unnecessarily.

For explicitly selected English:

```ts
model: "nova-3",
language: "en-US",
```

The application must continue supporting other source languages.

Do NOT globally hard-code:

```ts
language: "en-US"
```

for every session.

Instead determine whether the current session is English.

For example:

```ts
const isEnglishSession =
  !isAutoDetect &&
  this.mapToDeepgramLanguageCode(
    this.opts.sourceLanguage
  ).startsWith("en");
```

Then:

```ts
model: "nova-3",

language: isEnglishSession
  ? "en-US"
  : this.mapToDeepgramLanguageCode(this.opts.sourceLanguage),
```

---

# PHASE 2 — REMOVE UNNECESSARY LANGUAGE AUTO-DETECTION FOR ENGLISH
If the user has explicitly selected English as the source language, do not send the session through multilingual auto-detection.

Known English preaching should use:

```ts
language: "en-US"
```

The reason is not that Nigerian English is American English.

The reason is that the speech is known to be English, so we should eliminate unnecessary language-detection uncertainty.

Preserve auto-detection for sessions where the user has actually requested automatic language detection.

Do not break multilingual functionality.

---

# PHASE 3 — BUILD A GENERAL + DOMAIN DEEPGRAM KEYTERM SYSTEM

## Objective
Do not limit Deepgram Keyterm Prompting to Christian, pastoral, or RCCG terminology.

The speaker uses Nigerian-accented English across many subjects.

Therefore the STT system needs a layered vocabulary strategy:

```text
GENERAL ENGLISH KEYTERMS
        +
NIGERIAN ENGLISH / PERSONAL KEYTERMS
        +
CHRISTIAN / BIBLICAL KEYTERMS
        +
RCCG / MINISTRY KEYTERMS
        +
PERSONAL NAMES / PLACES / ORGANIZATIONS
        ↓
Deepgram Nova-3
```

The purpose is to improve recognition of important words and phrases across the speaker's entire range of conversation, not just preaching.

---

# 3.1 GENERAL ENGLISH KEYTERMS
Create a general vocabulary layer containing words and phrases that are:

- commonly used in everyday speech
- likely to be confused phonetically
- important to the speaker's communication
- commonly misrecognized in previous transcripts
- frequently used in meetings
- frequently used in business
- frequently used in teaching
- frequently used in technical discussions
- frequently used in travel
- frequently used in facility management
- frequently used in ministry
- frequently used in normal conversation

Examples of categories:

### Commonly confused words

```text
praise
press
prayer
player
pray
prey
pastor
faster
anointing
annoying
access
excess
accept
except
affect
effect
advice
advise
breath
breathe
career
carrier
complement
compliment
desert
dessert
device
devise
ensure
insure
principal
principle
quiet
quite
right
write
site
sight
stationary
stationery
their
there
they're
weather
whether
where
were
wear
```

Do NOT assume every word above should permanently be sent as a Keyterm.
Use these as candidates for testing and personalization.

---

# 3.2 GENERAL PHRASES
Include important phrases that may be recognized incorrectly as a different phrase.

Examples:

```text
in fact
as a matter of fact
at the moment
at this point
in this case
on the other hand
for example
for instance
as a result
in other words
at the same time
from my experience
in my opinion
I believe
I think
I would like
I want to
I need to
we need to
we have to
we are going to
we're going to
let me explain
let me give you an example
what I mean is
the reason is
the point is
the problem is
the solution is
the main issue
the next step
the first thing
the second thing
most importantly
generally speaking
normally
actually
basically
especially
particularly
approximately
immediately
eventually
finally
```

Again, these should be treated as candidates and validated against real transcripts rather than blindly adding every common phrase.

---

# 3.3 PROFESSIONAL / TECHNICAL VOCABULARY
Because the speaker also communicates about professional and technical subjects, create a separate vocabulary layer for words such as:

```text
facility management
facilities management
property management
real estate
asset management
project management
construction
engineering
civil engineering
maintenance
preventive maintenance
predictive maintenance
corrective maintenance
work order
work orders
maintenance schedule
maintenance management
facility
facilities
building management
building services
operations
procurement
contractor
contractors
consultant
consultants
stakeholder
stakeholders
compliance
risk assessment
risk management
health and safety
occupational health
safety management
quality assurance
quality control
budget
budgeting
quotation
invoice
contract
contractor
tender
project
project scope
scope of work
bill of quantities
BOQ
technical specification
asset register
CMMS
CAFM
IoT
automation
software
application
platform
database
API
backend
frontend
Supabase
LiveKit
Cloudflare
Deepgram
ElevenLabs
OpenAI
GPT-4o
React
TypeScript
Vite
Flutter
Capacitor
```

Only include technical terms that are relevant to the actual speaker's communication.

---

# 3.4 BUSINESS / ORGANIZATIONAL VOCABULARY
Create another vocabulary layer for recurring organizational and business language.

Examples:

```text
organization
organization's
management
leadership
strategy
strategic
initiative
implementation
coordination
collaboration
partnership
proposal
presentation
meeting
minutes
agenda
appointment
assignment
responsibility
accountability
authority
approval
authorization
documentation
registration
application
requirement
process
procedure
policy
framework
development
deployment
integration
subscription
payment
funding
sponsorship
support
investment
revenue
customer
client
member
membership
community
network
networking
stakeholder
```

---

# 3.5 TRAVEL / LOCATION VOCABULARY
Because the application may be used during international travel and communication, maintain a location/travel vocabulary layer.

Examples:

```text
airport
immigration
customs
visa
passport
transit
boarding
boarding pass
departure
arrival
connecting flight
layover
baggage
luggage
checked baggage
carry-on
hand luggage
terminal
gate
airline
reservation
hotel
accommodation
Vietnam
Nigeria
Lagos
Abuja
Ho Chi Minh City
Saigon
Hanoi
District 7
District 4
Mumbai
Doha
Qatar
```

Only add names/locations that are actually relevant to the user.

---

# 3.6 NIGERIAN ENGLISH / PERSONAL VOCABULARY
Create a personal vocabulary layer.

This should be based on the speaker's actual speech rather than assumptions.

Examples of phrases that may appear frequently in Nigerian English:

```text
by God's grace
by the grace of God
to God be the glory
God willing
as God permits
I want to appreciate
I appreciate you
I want to encourage you
I want to charge you
let me quickly say
let me quickly add
I want to submit
I want to emphasize
I want to stress
I want to appeal
I want to draw your attention
please note
kindly note
I will get back to you
I will revert to you
let us
let's
I am coming
I will be with you
we shall
we are trusting God
```

IMPORTANT:

Do not "correct" Nigerian English merely because it differs from American or British English.

The goal is transcription fidelity.

If the speaker says:

> "I want to appreciate you."

the transcript should preserve that expression rather than changing it to:

> "I want to thank you."

unless the speaker actually said "thank you."

---

# 3.7 CHRISTIAN / BIBLICAL VOCABULARY
Maintain the existing Christian vocabulary layer.

Examples:

```text
Jesus Christ
Holy Spirit
Holy Ghost
God Almighty
Father Lord
Word of God
Bible
Scripture
Gospel
salvation
redemption
righteousness
sanctification
consecration
deliverance
breakthrough
anointing
testimony
prophecy
prophetic
intercession
ministration
evangelism
evangelist
missionary
altar
congregation
Hallelujah
Hosanna
Amen
```

---

# 3.8 RCCG / MINISTRY VOCABULARY
Maintain a separate RCCG/ministry layer.

Examples:

```text
RCCG
Redeemed Christian Church of God
Redeemed
Redeemer
Redemption Camp
Holy Ghost Service
Holy Ghost Congress
General Overseer
G O
Mummy G O
Workers
Workers Meeting
Sunday School
House Fellowship
Holy Communion
soul winning
soul winner
Great Commission
mission field
harvest of souls
```

---

# 3.9 PERSONAL NAMES AND PROPER NOUNS
Create a dynamic personal proper-noun vocabulary.

This should include:

- names of pastors
- names of ministers
- family names
- church names
- organization names
- company names
- city names
- country names
- ministry names
- project names
- product names
- technology names

Examples:

```text
Tola
Tola Francis Olabanjo
Tolulope
Redeemed Christian Church of God
Rekindle
Facility Space
IFMA
IFMA Vietnam
Supabase
LiveKit
Cloudflare
Deepgram
ElevenLabs
OpenAI
```

Do not permanently hard-code every name into the global vocabulary.
Allow the application to add session-specific proper nouns when appropriate.

---

# 3.10 CREATE A VOCABULARY HIERARCHY
Do not maintain one enormous unstructured array.

Use categories:

```ts
export const STT_KEYTERMS = {
  general: [...],

  commonConfusions: [...],

  phrases: [...],

  professional: [...],

  technical: [...],

  business: [...],

  travel: [...],

  NigerianEnglish: [...],

  christian: [...],

  rccg: [...],

  properNouns: [...]
};
```

Then create a function that determines which vocabulary should be sent to Deepgram for the current session.

Conceptually:

```ts
getKeyterms({
  sourceLanguage,
  sessionType,
  ministryMode,
  professionalMode,
  technicalMode,
  knownProperNouns
})
```

For example:

### Normal conversation

```text
General
+
Common Confusions
+
Personal Vocabulary
+
Known Proper Nouns
```

### Professional meeting

```text
General
+
Professional
+
Business
+
Technical
+
Personal Vocabulary
+
Known Proper Nouns
```

### Christian preaching

```text
General
+
Common Confusions
+
Christian
+
RCCG
+
Nigerian English
+
Personal Vocabulary
+
Known Proper Nouns
```

This prevents irrelevant vocabulary from overwhelming every session.

---

# 3.11 IMPORTANT — DO NOT ADD EVERY ENGLISH WORD
Do NOT create a list containing thousands of ordinary English words simply because they are English.

Keyterm Prompting should focus on:

1. Words that matter to the speaker.
2. Words that are frequently misrecognized.
3. Specialized terminology.
4. Proper nouns.
5. Important phrases.
6. Words with known contextual confusion.

The system should become personalized from actual transcript errors.

---

# 3.12 BUILD THE PERSONAL KEYTERM DATABASE
The long-term architecture should allow the application to learn from real STT results.

Example:

```ts
interface PersonalSTTTerm {
  term: string;
  category: string;
  occurrences: number;
  confidence?: number;
  correctionCount: number;
  lastSeen: string;
  approved: boolean;
}
```

A term should become a permanent personalized keyterm only after repeated evidence or developer approval.

Example:

```text
Deepgram repeatedly produces:

press God

Actual phrase:

praise God

↓
record correction

↓
developer approves

↓
"praise God" becomes a high-priority personal keyterm
```

---

# 3.13 DO NOT CONFUSE KEYTERMS WITH CORRECTION RULES
These are different mechanisms.

### Keyterm Prompting
Helps Deepgram recognize the correct word while listening.

```text
audio
↓
Deepgram
↓
"praise God"
```

### Correction Dictionary
Corrects a known STT error after transcription.

```text
Deepgram
↓
"press God"
↓
correction layer
↓
"praise God"
```

Use both.

They complement each other.

---

# 3.14 FINAL KEYTERM ARCHITECTURE
The final STT request should conceptually be:

```ts
const keyterms = buildSessionKeyterms({
  general: true,
  commonConfusions: true,
  personal: true,
  christian: session.isMinistry,
  rccg: session.isRccg,
  professional: session.isProfessional,
  technical: session.isTechnical,
  travel: session.isTravel,
  properNouns: session.knownProperNouns
});
```

Then pass the resulting keyterms to the Nova-3 streaming configuration using the exact syntax supported by the installed Deepgram SDK.

Do not invent API parameters.

Verify the SDK types first.

---

# 3.15 SUCCESS CRITERION
The goal of Keyterm Prompting is not:

> "Make Deepgram use these words."

The goal is:

> When the speaker actually says a word or phrase, increase the probability that Deepgram recognizes the word or phrase correctly.

The final transcript must remain faithful to what was spoken.

Do not force a keyterm into the transcript when the speaker did not say it.
Do not use Keyterms as a substitute for contextual transcript correction.

The complete strategy is:

```text
English speech
        ↓
Nova-3
        +
General Keyterms
        +
Personal Keyterms
        +
Domain Keyterms
        +
Proper Nouns
        ↓
Raw STT
        ↓
Personal contextual correction
        ↓
Optional GPT-4o verification
        ↓
Accurate English transcript
        ↓
GPT-4o translation
        ↓
ElevenLabs TTS
```

This is the architecture to implement.

---

# PHASE 4 — CONFIGURE ENDPOINTING FOR PREACHING
Endpointing is primarily a speech-segmentation setting, not an accent-recognition setting.

The purpose of this phase is to make sure natural preaching pauses do not cause incomplete transcript segments.

Make endpointing configurable.

Test:

### Baseline

```ts
endpointing = 300
utterance_end_ms = 1000
```

### Test A

```ts
endpointing = 500
utterance_end_ms = 1500
```

### Test B

```ts
endpointing = 700
utterance_end_ms = 1500
```

Start with:

```ts
endpointing: 500,
utterance_end_ms: 1500,
```

but do not assume this is automatically optimal.

Measure:

- transcript completeness
- latency
- dropped words
- duplicate fragments
- response speed
- natural preaching pauses

Choose the setting based on actual testing.

---

# PHASE 5 — CREATE A PERSONAL NIGERIAN-PASTORAL STT ERROR DICTIONARY
This is a core component.

The dictionary should be built from real errors produced by this speaker, not generic assumptions about Nigerian English.

Create:

```text
src/stt/pastoralCorrections.ts
```

Use contextual corrections.

Example:

```ts
export const PASTORAL_CONTEXT_CORRECTIONS = [
  {
    incorrect: "press God",
    correct: "praise God",
  },
  {
    incorrect: "press the Lord",
    correct: "praise the Lord",
  },
  {
    incorrect: "Holy Speed",
    correct: "Holy Spirit",
  },
  {
    incorrect: "player",
    correct: "prayer",
  },
  {
    incorrect: "prey",
    correct: "pray",
  },
  {
    incorrect: "faster",
    correct: "pastor",
  },
  {
    incorrect: "annoying",
    correct: "anointing",
  }
];
```

IMPORTANT:

Never implement dangerous global replacements.

DO NOT do:

```ts
"press" -> "praise"
```

because:

> "Press the button"

is legitimate speech.

Instead use contextual phrases:

```ts
"press God" -> "praise God"
"press the Lord" -> "praise the Lord"
```

The correction system must prioritize semantic context.

---

# PHASE 6 — COLLECT REAL STT ERRORS
Add development-only logging so we can learn from actual sermons.

For final transcript segments, capture:

```ts
{
  rawTranscript,
  confidence,
  model,
  language,
  timestamp
}
```

If a correction occurs, also record:

```ts
{
  rawTranscript,
  correctedTranscript,
  correctionReason
}
```

Do not automatically promote GPT-4o corrections into permanent rules.

The workflow should be:

```text
Real sermon
    ↓
Deepgram transcript
    ↓
Review errors
    ↓
Identify recurring errors
    ↓
Developer approves correction
    ↓
Add to personal dictionary
```

This produces a personalized Nigerian-pastoral STT model layer over time.

---

# PHASE 7 — DO NOT SEND INTERIM TRANSCRIPTS TO GPT-4o
This is critical.

Deepgram produces interim results while the person is speaking.

Do NOT send every interim result to GPT-4o.

Use interim results only for the live UI or existing real-time logic.

Preferred architecture:

```text
Deepgram INTERIM
        ↓
UI/live display
```

Then:

```text
Deepgram FINAL / SPEECH FINAL
        ↓
STT correction
        ↓
translation
```

This prevents:

- excessive GPT-4o usage
- unnecessary latency
- duplicate translation
- unstable partial translations

Preserve the application's existing final/speech-final handling if it is already correct.

---

# PHASE 8 — ADD LIGHTWEIGHT GPT-4o STT CORRECTION
After Deepgram produces a final English transcript, introduce a conservative correction stage.

The purpose of this model is NOT translation.

The purpose is:

> Determine whether the transcript contains a likely speech-recognition error and correct it only when the context strongly supports the correction.

Pipeline:

```text
Deepgram
↓
Raw English transcript
↓
Deterministic corrections
↓
GPT-4o STT correction
↓
Verified English transcript
↓
GPT-4o translation
```

The correction prompt should follow this principle:

```text
You are an English speech-transcript correction engine.

The speaker is a Nigerian Christian pastor preaching in English.

Your task is to correct ONLY likely speech-recognition errors.

Preserve exactly:
- the speaker's meaning
- the speaker's wording
- repetitions
- emphasis
- rhetorical questions
- preaching style
- Nigerian English expressions
- Christian terminology
- Bible terminology
- names
- Bible references

Do NOT:
- summarize
- paraphrase
- improve grammar unnecessarily
- rewrite sentences
- make the speaker sound more formal
- remove repetition
- add information
- translate
- interpret theology

Only change a word or phrase when the surrounding context strongly indicates that Deepgram misrecognized what was said.

Example:

"Let us press God for what He has done."

may be corrected to:

"Let us praise God for what He has done."

because "praise God" is semantically appropriate in Christian preaching.

But:

"Press the button."

must remain:

"Press the button."

Return ONLY the corrected English transcript.
```

---

# PHASE 9 — USE GPT-4o CORRECTION SELECTIVELY
Do not automatically send every transcript to GPT-4o if this causes unnecessary latency or cost.

First run inexpensive deterministic checks.

Potential triggers include:

- known STT error phrases
- suspicious words
- low-confidence segments
- unusual words in a pastoral context
- words frequently misrecognized in previous sermons

Example:

```text
Deepgram
   ↓
Does transcript contain suspicious pattern?
   ↓
NO ───────────────→ GPT-4o translation
   ↓
YES
   ↓
Local correction
   ↓
GPT-4o verification
   ↓
GPT-4o translation
```

However, do not create an arbitrary confidence threshold without first examining actual Deepgram confidence data.

---

# PHASE 10 — PRESERVE THE ORIGINAL SPEECH
This is one of the most important requirements.

The correction system must NOT turn transcription into summarization.

If the pastor says:

> "Somebody shout Hallelujah! Hallelujah! I say shout Hallelujah!"

the transcript should remain essentially:

> "Somebody shout Hallelujah! Hallelujah! I say shout Hallelujah!"

It must NOT become:

> "The pastor encouraged everyone to praise God."

That would destroy information needed for accurate translation.

Similarly, if the pastor intentionally repeats:

> "God is good! God is good! God is good!"

preserve the repetition.

The STT correction layer must be:

faithful, conservative and minimally invasive.

---

# PHASE 11 — PRESERVE BIBLE REFERENCES
Never unnecessarily alter Bible references.

Examples:

```text
John 3:16
Romans 8:28
Psalm 23
Isaiah 41:10
Matthew 6:33
1 Corinthians 13
2 Timothy 1:7
```

Preserve:

- book names
- chapters
- verses
- numbers
- colon notation
- abbreviations

The correction layer must not turn Bible references into ordinary words.

---

# PHASE 12 — CREATE A TRANSCRIPT QUALITY GATE
Before sending text to the translation model, the application should conceptually have:

```text
RAW STT
   ↓
Is this a final segment?
   ↓
YES
   ↓
Local STT correction
   ↓
Does it contain suspicious content?
   ↓
YES → GPT-4o correction
   ↓
FINAL VERIFIED ENGLISH
   ↓
TRANSLATION
```

The translated model should receive the verified English transcript, not the raw Deepgram transcript.

This is the most important architectural change.

---

# PHASE 13 — KEEP TRANSLATION SEPARATE FROM STT CORRECTION
Do not combine these prompts into one vague request such as:

> "Correct and translate this."

Instead use two conceptual stages.

### Stage 1

```text
Speech → accurate English transcript
```

### Stage 2

```text
Accurate English transcript → translation
```

This allows us to diagnose errors.

If the English transcript is wrong:

STT problem.

If the English transcript is correct but the translation is wrong:

translation problem.

This separation is required.

---

# PHASE 14 — ONLY AFTER STT IS STABLE, OPTIMIZE ELEVENLABS
Do not modify ElevenLabs pronunciation dictionaries during the initial STT work.

First establish that:

```text
English speech
→ accurate English transcript
→ accurate translation
```

Only then optimize:

```text
translated text
→ ElevenLabs
→ correct pronunciation
```

This prevents us from trying to solve an STT problem inside TTS.

---

# PHASE 15 — TESTING MATRIX
Use the same 3–5 minute Nigerian English sermon recording for all tests.

It should contain:

- normal preaching
- fast preaching
- pauses
- prayer
- Bible references
- repetition
- rhetorical questions
- "praise God"
- "praise the Lord"
- "Holy Spirit"
- "Holy Ghost"
- "anointing"
- "deliverance"
- "ministration"
- "intercession"
- "righteousness"
- "sanctification"
- "pastor"
- "missionary"
- RCCG terminology

Test:

### BASELINE

```ts
Nova-2
English
no keyterms
endpointing 300
```

### TEST 1

```ts
Nova-3
English
no keyterms
endpointing 300
```

### TEST 2

```ts
Nova-3
English
keyterms
endpointing 300
```

### TEST 3

```ts
Nova-3
English
keyterms
endpointing 500
utterance_end_ms 1500
```

### TEST 4

```ts
Nova-3
English
keyterms
endpointing 500
local correction
```

### TEST 5

```ts
Nova-3
English
keyterms
endpointing 500
local correction
GPT-4o correction
```

Compare:

- overall word accuracy
- semantic accuracy
- Christian terminology accuracy
- Bible-reference accuracy
- "praise/press" errors
- "prayer/player" errors
- "pastor/faster" errors
- "anointing/annoying" errors
- Nigerian names
- RCCG terminology
- dropped words
- duplicated words
- latency
- GPT-4o calls
- translation quality

---

# PHASE 16 — DEFINE THE SUCCESS METRIC CORRECTLY
Do NOT judge success only by:

> "Does the transcript look grammatically good?"

Instead measure:

### 1. Semantic fidelity
Does the transcript represent what the pastor actually said?

### 2. Ministry terminology accuracy
Are Christian terms recognized correctly?

### 3. Bible accuracy
Are Bible books, chapters and verses preserved?

### 4. Contextual accuracy
Does the transcript make sense in the context of Christian preaching without rewriting the speaker?

### 5. Translation accuracy
Does the corrected English produce a better translation?

The ultimate success metric is:

> Does improving the English source transcript produce a measurable improvement in the final translation?

---

# PHASE 17 — EXPECTED FINAL ARCHITECTURE
The final system should look like this:

```text
                 🎙️ NIGERIAN PASTOR
                        │
                        ▼
               ┌─────────────────┐
               │ Deepgram Nova-3 │
               │                 │
               │ English         │
               │ Keyterms        │
               │ Streaming       │
               └────────┬────────┘
                        │
                        ▼
                RAW ENGLISH STT
                        │
                        ▼
             ┌─────────────────────┐
             │ Local Corrections   │
             │                     │
             │ Personal Nigerian  │
             │ Pastoral Dictionary│
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │ GPT-4o Verification │
             │                     │
             │ Conservative only   │
             └──────────┬──────────┘
                        │
                        ▼
             VERIFIED ENGLISH TEXT
                        │
                        ▼
             ┌─────────────────────┐
             │      GPT-4o         │
             │     TRANSLATION     │
             └──────────┬──────────┘
                        │
                        ▼
              CORRECT TRANSLATION
                        │
                        ▼
             ┌─────────────────────┐
             │     ElevenLabs      │
             │        TTS          │
             └──────────┬──────────┘
                        │
                        ▼
                       🔊
```

---

# IMPLEMENTATION RULES
Follow these rules strictly:

1. Inspect before modifying.
2. Make changes incrementally.
3. Do not rewrite unrelated code.
4. Do not replace the entire `AudioPipeline` unless absolutely necessary.
5. Preserve LiveKit audio handling.
6. Preserve the existing translation pipeline.
7. Preserve ElevenLabs functionality.
8. Preserve multilingual functionality.
9. Do not hard-code English globally.
10. Do not send interim transcripts unnecessarily to GPT-4o.
11. Do not use global word replacements.
12. Do not summarize or paraphrase the speaker.
13. Do not remove intentional repetition.
14. Do not alter Bible references unnecessarily.
15. Do not invent Deepgram parameters.
16. Verify SDK support before implementing Keyterm Prompting.
17. Do not upgrade the SDK unless required.
18. Keep STT correction separate from translation.
19. Log real STT errors during development.
20. Do not modify ElevenLabs pronunciation until STT and translation accuracy have been validated.

---

# FINAL DELIVERABLE
After implementation, report:

## A. Files changed
List every modified and newly created file.

## B. Deepgram configuration
Show the final:

```ts
model
language
encoding
sample_rate
channels
interim_results
smart_format
endpointing
utterance_end_ms
keyterms
```

## C. STT correction
Show:

- deterministic correction architecture
- personal pastoral error dictionary
- GPT-4o correction architecture
- correction trigger logic

## D. Translation pipeline
Confirm that GPT-4o translation receives the corrected English transcript, not the raw Deepgram transcript.

## E. Testing
Provide results comparing:

```text
Nova-2 baseline
vs
Nova-3
vs
Nova-3 + keyterms
vs
Nova-3 + keyterms + endpointing
vs
Nova-3 + keyterms + correction
vs
Nova-3 + keyterms + correction + GPT-4o verification
```

## F. Remaining errors
List the most common remaining Nigerian English STT errors.

## G. Next phase
Only after the English STT is stable, recommend the ElevenLabs pronunciation optimization.

---

# MOST IMPORTANT PRINCIPLE
The system must always follow this priority:

WHAT DID THE PASTOR ACTUALLY SAY?

before:

HOW SHOULD IT BE TRANSLATED?

and only after that:

HOW SHOULD THE TRANSLATION BE SPOKEN?

Therefore:

STT accuracy → English semantic accuracy → translation accuracy → TTS pronunciation accuracy.

Do not optimize the later stages to compensate for errors that should have been fixed in the STT stage.
