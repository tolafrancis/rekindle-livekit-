// supabase/functions/_shared/devotionalNarration.ts
//
// The read-aloud narration for a devotional, shared by the browser
// (DevotionalModule + HighQualityAudioPlayer, via
// packages/features/src/devotionalNarration.ts) and the
// prewarm-devotional-audio edge function, which prepares each morning's audio
// ahead of the first listener.
//
// Both sides MUST build byte-identical text: the TTS cache key carries a hash
// of the text (devotionalAudioContentId), so any drift means the prepared
// audio is never found and the first listener waits for generation again.
// Keep this file free of imports so Deno and Vite can both load it as is.

export interface NarrationScriptureRef {
  reference: string;
  text: string;
  version?: string;
}

/** The devotional fields the narration reads (DevotionalModule's normalizedDevotional). */
export interface NarrationDevotional {
  title: string;
  author?: string;
  scripture?: string;
  scriptureText?: string;
  biblePassageReference?: string;
  biblePassageText?: string;
  scriptureReferences?: NarrationScriptureRef[];
  message?: string;
  prayer?: string;
  reflectionQuestions?: string[];
}

export type NarrationSlideType = 'intro' | 'passage' | 'devotional' | 'reflection' | 'prayer' | 'spirit' | 'closing';

export interface NarrationSlide {
  type: NarrationSlideType;
  title: string;
  content: string;
  scripture?: string;
  scriptureText?: string;
  scriptureVersion?: string;
  isLongPassage?: boolean;
  questions?: string[];
}

/** Looks up a string in the `devotionals` UI namespace, falling back to the English default. */
export type NarrationStrings = (key: string, fallback: string) => string;

/** The `devotionals` namespace keys the slides use, with their English text. */
export const NARRATION_STRING_DEFAULTS: Record<string, string> = {
  readerWelcome: "You are welcome to today's devotional. This time is set apart for you and God.",
  readerWrittenBy: 'Written by',
  readerScripturePassage: 'Scripture Passage',
  readerAdditionalScripture: 'Additional Scripture',
  readerReadSlowly: 'Read slowly. Let the words rest in your heart.',
  readerBiblePassage: 'Bible Passage',
  readerDevotional: 'Devotional',
  readerReflectionQuestions: 'Reflection Questions',
  readerReflectionContent: 'Consider how this truth meets you where you are today.',
  readerGuidedPrayer: 'Guided Prayer',
  readerPrayInSpirit: 'Pray in the Spirit',
  readerPrayInSpiritContent: 'There is no hurry. Stay as long as you need.\n\nWhen you are ready, gently mark this time complete.',
  readerGoInPeace: 'Go in Peace',
  readerGoInPeaceContent: 'May the Lord bless you and keep you.\nMay His face shine upon you and give you peace.\nGo forth in His love today.',
};

/** The daily devotional's slides, in the order the reader shows them. */
export function buildDevotionalNarrationSlides(d: NarrationDevotional, tr: NarrationStrings): NarrationSlide[] {
  const s = (key: string) => tr(key, NARRATION_STRING_DEFAULTS[key]);

  // Intro: welcome line, plus the author entered when the devotional was
  // created (shown only when an author is set; no fallback text).
  const authorName = d.author?.trim();
  const welcomeLine = s('readerWelcome');
  const introContent = authorName ? `${welcomeLine}\n\n${s('readerWrittenBy')} ${authorName}` : welcomeLine;

  const slides: NarrationSlide[] = [{ type: 'intro', title: d.title, content: introContent }];

  const refs = d.scriptureReferences || [];
  if (refs.length > 0) {
    refs.forEach((ref, idx) => {
      slides.push({
        type: 'passage',
        title: idx === 0 ? s('readerScripturePassage') : s('readerAdditionalScripture'),
        content: s('readerReadSlowly'),
        scripture: ref.reference,
        scriptureText: ref.text,
        scriptureVersion: ref.version,
      });
    });
  } else if (d.scripture || d.scriptureText) {
    slides.push({
      type: 'passage',
      title: s('readerScripturePassage'),
      content: s('readerReadSlowly'),
      scripture: d.scripture,
      scriptureText: d.scriptureText,
    });
  }

  if (d.biblePassageReference || d.biblePassageText) {
    slides.push({
      type: 'passage',
      title: s('readerBiblePassage'),
      content: s('readerReadSlowly'),
      scripture: d.biblePassageReference,
      scriptureText: d.biblePassageText,
      isLongPassage: true,
    });
  }

  slides.push({ type: 'devotional', title: s('readerDevotional'), content: d.message || '' });

  if (d.reflectionQuestions && d.reflectionQuestions.length > 0) {
    slides.push({
      type: 'reflection',
      title: s('readerReflectionQuestions'),
      content: s('readerReflectionContent'),
      questions: d.reflectionQuestions,
    });
  }

  if (d.prayer && d.prayer.trim()) {
    slides.push({ type: 'prayer', title: s('readerGuidedPrayer'), content: d.prayer });
  }

  slides.push(
    { type: 'spirit', title: s('readerPrayInSpirit'), content: s('readerPrayInSpiritContent') },
    { type: 'closing', title: s('readerGoInPeace'), content: s('readerGoInPeaceContent') },
  );

  return slides;
}

/** What read aloud says for one slide. */
export function devotionalSlideNarration(slide: NarrationSlide | undefined): string {
  // The first screen opens with the devotional's own title (never the series
  // or ministry name, which is what used to be read here).
  let text = slide?.type === 'intro' && slide.title ? `${slide.title}.\n\n` : '';

  if (slide?.scripture) text += `${slide.scripture}\n`;
  if (slide?.scriptureText) text += `${slide.scriptureText}\n\n`;

  // Reflection slides: read the intro sentence AND each question
  if (slide?.type === 'reflection' && slide?.questions?.length) {
    text += slide.content + ' ';
    slide.questions.forEach((q, idx) => {
      text += `Question ${idx + 1}: ${q}. `;
    });
  } else {
    text += slide?.content || '';
  }

  if (slide?.type === 'prayer' || slide?.title.toLowerCase().includes('prayer')) {
    text = `Prayer:\n${text}`;
  }

  return text;
}

/** Short, stable fingerprint of the narration text (djb2, base 36). */
export function narrationTextHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** tts_audio_cache.content_id for one slide's audio. The text hash means
 *  changed narration generates fresh audio instead of replaying a stale clip. */
export function devotionalAudioContentId(contentId: string, slideIndex: number | undefined, text: string): string {
  return `${contentId}_slide${slideIndex}_${narrationTextHash(text)}`;
}
