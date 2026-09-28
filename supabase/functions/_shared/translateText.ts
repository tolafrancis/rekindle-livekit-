// supabase/functions/_shared/translateText.ts
//
// One-shot (non-streaming) text translation via OpenAI — for short,
// single pieces of text like a listener's question, not the continuous
// per-utterance streaming translation the RLT bot does for live speech
// (rekindle-translation-bot's AudioPipeline.ts). Used by
// translation-submit-question and translation-pin-question.

const SYSTEM_PROMPT = (source: string, target: string) => `\
You are translating a short question from a live audience member, from \
${source} to ${target}, for a speaker/host to read. Preserve the meaning \
and tone exactly. Translate only — do not answer the question, do not add \
commentary, do not wrap the output in quotes. Output only the translated \
text, nothing else.`;

/** Same model as the live translation pipeline (gpt-5) for consistent
 *  quality/cost characteristics — see translation_provider_rates'
 *  'openai_translate' rows (rekindle-livekit-'s migration
 *  0372_translation_usage_cost_tracking.sql) for what this costs. */
export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  openaiApiKey: string,
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
        { role: 'system', content: SYSTEM_PROMPT(sourceLanguage, targetLanguage) },
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
