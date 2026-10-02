// supabase/functions/_shared/translateText.ts
//
// One-shot (non-streaming) text translation via OpenAI — for short,
// single pieces of text like a listener's question, not the continuous
// per-utterance streaming translation the RLT bot does for live speech
// (rekindle-translation-bot's AudioPipeline.ts). Used by
// translation-submit-question, translation-pin-question and
// bilingual-conversation.

/** What kind of text is being translated — only changes the framing the
 *  model is given, not the model or output shape. */
export type TranslateContext = 'question' | 'answer' | 'conversation';

const SYSTEM_PROMPT = (source: string, target: string, context: TranslateContext) => {
  const framing = {
    question: 'a short question from a live audience member, for a speaker/host to read',
    answer: "a speaker's short written reply to an audience question, for listeners to read",
    conversation: 'one spoken turn from a live two-person conversation, transcribed by speech recognition (it may lack punctuation or contain small recognition errors — translate the intended meaning)',
  }[context];
  return `\
You are translating ${framing}, from ${source} to ${target}. Preserve the \
meaning and tone exactly. Translate only — do not answer or respond to the \
text, do not add commentary, do not wrap the output in quotes. Output only \
the translated text, nothing else.`;
};

/** Same model as the live translation pipeline (gpt-5) for consistent
 *  quality/cost characteristics — see translation_provider_rates'
 *  'openai_translate' rows (rekindle-livekit-'s migration
 *  0372_translation_usage_cost_tracking.sql) for what this costs. */
export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  openaiApiKey: string,
  context: TranslateContext = 'question',
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (sourceLanguage.trim().toLowerCase() === targetLanguage.trim().toLowerCase()) return trimmed;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
    body: JSON.stringify({
      model: 'gpt-5',
      max_completion_tokens: 300,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(sourceLanguage, targetLanguage, context) },
        { role: 'user', content: trimmed },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI translate error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}
