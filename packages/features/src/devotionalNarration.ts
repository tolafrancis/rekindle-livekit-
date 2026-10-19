// The devotional read-aloud narration lives in supabase/functions/_shared/ so
// the reader and the prewarm-devotional-audio edge function build identical
// text (and so identical TTS cache keys). Same pattern as giftAid/r68Builder.
export * from '../../../supabase/functions/_shared/devotionalNarration';
