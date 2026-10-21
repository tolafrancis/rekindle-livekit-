import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpCircle, Loader2, Send, UserRound, X } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { Textarea } from '@rekindle/ui/textarea';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { useCurrentMinistryOptional } from '../CurrentMinistryContext';
import { fetchFaqItems, type FaqAudience, type FaqItem } from '../faq';

// "Need help?" pop-up, mounted once per app. Opens with a few FAQ tips for the
// current page (answered instantly from faq_items, no AI call). Anything typed
// goes to the help-assistant edge function, which answers from the FAQ and the
// Rekindle Guide. When it isn't sure, or on request, "Talk to a person" files a
// support ticket with the chat attached (Platform Admin › Support Tickets).

type HelpApp = 'rekindle' | 'ministry';

interface HelpMessage {
  role: 'user' | 'assistant';
  content: string;
  confident?: boolean;
}

// Sits above the bottom-right stack (Pastoral Assistant / offline indicator /
// scroll-to-top at bottom-20, up to 8.5rem tall) so it never covers them.
// Full-screen and kiosk-style routes where a floating button would get in the way.
const HIDDEN_ROUTES = [/\/meeting\//, /\/webinar/, /^\/m\//, /^\/kiosk\//, /^\/display/, /^\/obs-captions\//, /^\/speak\//, /^\/conversation\//, /^\/channels\//];

// Page keyword -> words to look for in FAQ questions, so tips fit the page.
const PAGE_TOPICS: [RegExp, string[]][] = [
  [/small-group/, ['small group']],
  [/prayer/, ['prayer']],
  [/devotional/, ['devotional']],
  [/billing|subscription|plan/, ['plan', 'limit']],
  [/live|channel|broadcast/, ['live']],
  [/meeting/, ['meeting']],
  [/settings|account|profile/, ['account', 'membership', 'delete']],
];

const SESSION_KEY = 'rekindle.helpAssistant.chat';
const TIP_SEEN_KEY = 'rekindle.helpAssistant.tipSeen';

function readSession(): HelpMessage[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const HelpAssistant: React.FC<{ app: HelpApp }> = ({ app }) => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const ministryCtx = useCurrentMinistryOptional();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [messages, setMessages] = useState<HelpMessage[]>(readSession);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<'idle' | 'writing' | 'sent'>('idle');
  const [note, setNote] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hidden = HIDDEN_ROUTES.some((r) => r.test(location.pathname));
  const page = `${location.pathname}${location.search}`;
  const ministry = ministryCtx?.currentMinistry ?? null;
  const isLeader = !!(ministry?.isLeader || ministry?.isOwner || ministry?.role === 'admin');
  const audience: FaqAudience = app === 'ministry' && isLeader ? 'ministry' : 'individual';

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchFaqItems().then((rows) => { if (!cancelled) setFaq(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-20))); } catch { /* storage off */ }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, handoff]);

  // One-time nudge next to the button, the first time someone sees it.
  useEffect(() => {
    if (!user || hidden) return;
    let seen = true;
    try { seen = localStorage.getItem(TIP_SEEN_KEY) === '1'; } catch { /* treat as seen */ }
    if (seen) return;
    const showTimer = window.setTimeout(() => setShowTip(true), 4000);
    const hideTimer = window.setTimeout(() => setShowTip(false), 16000);
    try { localStorage.setItem(TIP_SEEN_KEY, '1'); } catch { /* storage off */ }
    return () => { window.clearTimeout(showTimer); window.clearTimeout(hideTimer); };
  }, [user, hidden]);

  const tips = useMemo(() => {
    const pool = faq.filter((f) => f.audience === audience || f.audience === 'general');
    const path = location.pathname.toLowerCase();
    const words = PAGE_TOPICS.filter(([re]) => re.test(path)).flatMap(([, w]) => w);
    const onTopic = pool.filter((f) => words.some((w) => f.question.toLowerCase().includes(w)));
    const rest = pool.filter((f) => f.audience === audience && !onTopic.includes(f));
    return [...onTopic, ...rest].slice(0, 3);
  }, [faq, audience, location.pathname]);

  if (!user || hidden) return null;

  const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant');
  const offerHuman = lastAnswer?.confident === false;

  const askTip = (item: FaqItem) => {
    setMessages((m) => [...m, { role: 'user', content: item.question }, { role: 'assistant', content: item.answer, confident: true }]);
  };

  const ask = async () => {
    const question = input.trim();
    if (!question || busy) return;
    const next: HelpMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('help-assistant', {
        body: {
          action: 'ask',
          app,
          page,
          language,
          messages: next.map(({ role, content }) => ({ role, content })),
        },
      });
      if (error || !data?.answer) throw error || new Error(data?.error || 'No answer');
      setLastMessageId(data.messageId ?? null);
      setMessages((m) => [...m, { role: 'assistant', content: data.answer, confident: data.confident !== false }]);
    } catch {
      setMessages((m) => [...m, {
        role: 'assistant',
        confident: false,
        content: t('helpAssistant', 'error', "Sorry, I couldn't answer just now. You can try again, or tap \"Talk to a person\"."),
      }]);
    } finally {
      setBusy(false);
    }
  };

  const sendHandoff = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('help-assistant', {
        body: {
          action: 'handoff',
          app,
          page,
          ministryId: ministry?.id ?? null,
          messageId: lastMessageId,
          note: note.trim(),
          messages: messages.map(({ role, content }) => ({ role, content })),
        },
      });
      if (error || !data?.ticketId) throw error || new Error(data?.error || 'No ticket');
      setSentTo(data.email ?? null);
      setHandoff('sent');
      setNote('');
    } catch {
      setMessages((m) => [...m, {
        role: 'assistant',
        confident: false,
        content: t('helpAssistant', 'handoffError', "Sorry, that didn't go through. Please email support@rekindlebc.com and we'll help."),
      }]);
      setHandoff('idle');
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setMessages([]);
    setLastMessageId(null);
    setHandoff('idle');
  };

  return (
    <div className="[body[data-fullscreen-chat]_&]:hidden">
      {open && (
        <div
          role="dialog"
          aria-label={t('helpAssistant', 'title', 'Rekindle Help')}
          className="fixed inset-x-2 bottom-2 z-[60] flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-20 sm:w-96 dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-white">
            <div>
              <p className="font-semibold">{t('helpAssistant', 'title', 'Rekindle Help')}</p>
              <p className="text-xs text-white/80">{t('helpAssistant', 'subtitle', 'Answers from our FAQ and guide')}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('helpAssistant', 'close', 'Close')} className="rounded-full p-1 hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 && (
              <p className="text-gray-600 dark:text-gray-300">
                {t('helpAssistant', 'intro', 'Hi! Ask me how to do anything in the app, or tap a common question.')}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && handoff === 'idle' && (
              <div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />{t('helpAssistant', 'thinking', 'Looking that up…')}</div>
            )}

            {tips.length > 0 && handoff === 'idle' && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t('helpAssistant', 'tips', 'Common questions')}</p>
                {tips.map((tip) => (
                  <button
                    key={tip.id}
                    type="button"
                    onClick={() => askTip(tip)}
                    className="block w-full rounded-xl border border-violet-200 px-3 py-2 text-left text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950"
                  >
                    {tip.question}
                  </button>
                ))}
              </div>
            )}

            {handoff === 'writing' && (
              <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <p className="font-medium">{t('helpAssistant', 'handoffTitle', 'Send this to the Rekindle team')}</p>
                <p className="text-xs text-gray-500">{t('helpAssistant', 'handoffHint', "We'll see this chat. Add anything else that would help, then send.")}</p>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('helpAssistant', 'handoffPlaceholder', 'What do you need help with?')} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setHandoff('idle')} disabled={busy}>{t('helpAssistant', 'cancel', 'Cancel')}</Button>
                  <Button size="sm" onClick={sendHandoff} disabled={busy || (!note.trim() && messages.length === 0)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('helpAssistant', 'send', 'Send')}
                  </Button>
                </div>
              </div>
            )}

            {handoff === 'sent' && (
              <div className="rounded-xl bg-green-50 p-3 text-green-800 dark:bg-green-950 dark:text-green-200">
                {sentTo
                  ? t('helpAssistant', 'handoffSentTo', 'Thanks! The team has your message and will reply to {email}.', { email: sentTo })
                  : t('helpAssistant', 'handoffSent', 'Thanks! The team has your message and will get back to you.')}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-700">
            {handoff === 'idle' && (
              <button
                type="button"
                onClick={() => setHandoff('writing')}
                className={`mb-2 flex items-center gap-1.5 text-xs ${offerHuman ? 'font-semibold text-violet-700 dark:text-violet-300' : 'text-gray-500'} hover:underline`}
              >
                <UserRound className="h-3.5 w-3.5" />
                {t('helpAssistant', 'talkToPerson', 'Talk to a person')}
              </button>
            )}
            {handoff === 'sent' ? (
              <Button variant="outline" size="sm" className="w-full" onClick={startOver}>{t('helpAssistant', 'newQuestion', 'Ask something else')}</Button>
            ) : (
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => { e.preventDefault(); ask(); }}
              >
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
                  rows={1}
                  maxLength={1000}
                  placeholder={t('helpAssistant', 'placeholder', 'Type your question…')}
                  className="min-h-[40px] resize-none"
                  disabled={handoff === 'writing'}
                />
                <Button type="submit" size="icon" disabled={busy || !input.trim() || handoff === 'writing'} aria-label={t('helpAssistant', 'ask', 'Ask')}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {!open && showTip && (
        <button
          type="button"
          onClick={() => { setShowTip(false); setOpen(true); }}
          className="fixed bottom-52 right-4 z-50 max-w-[14rem] rounded-2xl rounded-br-sm bg-white px-3 py-2 text-left text-sm text-gray-700 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:text-gray-100"
        >
          {t('helpAssistant', 'nudge', 'Have a question? Tap here and I can help.')}
        </button>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => { setShowTip(false); setOpen(true); }}
          aria-label={t('helpAssistant', 'open', 'Need help?')}
          className="fixed bottom-36 right-4 z-50 flex h-12 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-medium text-violet-700 shadow-lg ring-1 ring-violet-200 transition hover:scale-105 dark:bg-gray-800 dark:text-violet-300 dark:ring-violet-800"
        >
          <HelpCircle className="h-5 w-5" />
          <span className="hidden sm:inline">{t('helpAssistant', 'open', 'Need help?')}</span>
        </button>
      )}
    </div>
  );
};

export default HelpAssistant;
