// src/components/GraceCounselChat.tsx
// GraceCounsel AI companion — backend proxy (Supabase Edge Function), no API key in the browser.
// Features: markdown-rendered replies, multiple sessions, new-session + search.
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, AlertCircle, Plus, Search, Menu } from 'lucide-react';
import { marked } from 'marked';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SpiritualCompanionService } from '@/lib/AiSpiritualCompanion';
import { Alert, AlertDescription } from '@/components/ui/alert';

marked.setOptions({ breaks: true, gfm: true });
const toHtml = (text: string) => marked.parse(text || '') as string;

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  scripture?: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  last_message?: string;
  created_at: string;
  updated_at: string;
}

export const GraceCounselChat: React.FC = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [spiritualCompanion, setSpiritualCompanion] = useState<SpiritualCompanionService | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Initialize AI service (no API key needed — uses backend).
  useEffect(() => {
    try {
      setSpiritualCompanion(new SpiritualCompanionService());
    } catch (err: any) {
      console.error('Failed to initialize companion:', err);
      setError(t('grace', 'failedInit', "Failed to initialize spiritual companion. Please refresh the page."));
    }
  }, []);

  // Once the service and user are ready, load past sessions and open the most
  // recent one (or start a fresh one if there are none).
  useEffect(() => {
    if (!user || !spiritualCompanion) return;
    (async () => {
      const list = await loadSessions();
      if (!sessionId) {
        if (list.length > 0) selectSession(list[0]);
        else await startNewSession();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, spiritualCompanion]);

  const loadSessions = async (): Promise<ChatSession[]> => {
    if (!user) return [];
    const { data } = await supabase
      .from('ai_chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });
    const list = (data as ChatSession[]) || [];
    setSessions(list);
    return list;
  };

  const selectSession = async (session: ChatSession) => {
    setSessionId(session.id);
    setError(null);
    await loadSessionMessages(session.id);
    if (Capacitor.isNativePlatform()) {
      setSidebarOpen(false);
    }
  };

  const startNewSession = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('ai_chat_sessions')
        .insert({ user_id: user.id, title: `GraceCounsel - ${new Date().toLocaleDateString()}` })
        .select()
        .single();
      if (error) throw error;
      setSessionId(data.id);
      setSessions(prev => [data as ChatSession, ...prev]);
      setSearch('');
      await addWelcomeMessage(data.id);
      if (Capacitor.isNativePlatform()) {
        setSidebarOpen(false);
      }
    } catch (err) {
      console.error('New session error:', err);
      setError(t('grace', 'failedNewSession', "Failed to start a new session"));
    }
  };

  const loadSessionMessages = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const formatted: Message[] = (data || []).map((msg: any) => ({
        id: msg.id,
        role: msg.role === 'user' ? 'user' : 'ai',
        content: msg.content,
        scripture: msg.scripture_reference,
        timestamp: new Date(msg.created_at),
      }));
      setMessages(formatted);
    } catch (err) {
      console.error('Load messages error:', err);
    }
  };

  const addWelcomeMessage = async (id: string) => {
    const welcomeMsg: Message = {
      id: crypto.randomUUID(),
      role: 'ai',
      content: t('grace', 'welcomeMessage', "Welcome! I am GraceCounsel, your AI spiritual companion rooted in the Word of God. \"Come to me, all you who are weary and burdened, and I will give you rest\" (Matthew 11:28). How may I support you today?"),
      scripture: 'Matthew 11:28',
      timestamp: new Date(),
    };
    setMessages([welcomeMsg]);
    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: id,
        user_id: user?.id,
        role: 'assistant',
        content: welcomeMsg.content,
        scripture_reference: welcomeMsg.scripture,
      });
    } catch (err) {
      console.error('Failed to save welcome message:', err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !spiritualCompanion || !sessionId) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const isFirstUserMessage = messages.every(m => m.role !== 'user');

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: sessionId,
        user_id: user?.id,
        role: 'user',
        content: userMessage.content,
      });

      const response = await spiritualCompanion.sendMessage(
        [{ role: 'user', content: userMessage.content }],
        { language }
      );

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'ai',
        content: response.content,
        scripture: response.scriptureReference,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);

      await supabase.from('ai_chat_messages').insert({
        session_id: sessionId,
        user_id: user?.id,
        role: 'assistant',
        content: aiMessage.content,
        scripture_reference: aiMessage.scripture,
        metadata: { tokensUsed: response.tokensUsed },
      });

      // Keep the session list fresh: bump ordering, store a preview, and name
      // the session after the first thing the user asked.
      const sessionUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        last_message: userMessage.content.slice(0, 120),
      };
      if (isFirstUserMessage) sessionUpdate.title = userMessage.content.slice(0, 60);
      await supabase.from('ai_chat_sessions').update(sessionUpdate).eq('id', sessionId);
      loadSessions();
    } catch (err: any) {
      console.error('Send message error:', err);
      setError(err.message || t('grace', 'failedSend', "Failed to send message. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredSessions = sessions.filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (s.title || '').toLowerCase().includes(q) || (s.last_message || '').toLowerCase().includes(q);
  });

  if (!spiritualCompanion) {
    return (
      <div className={`bg-white rounded-xl shadow-lg flex items-center justify-center ${
        Capacitor.isNativePlatform() ? 'h-[calc(100vh-130px)]' : 'h-[600px]'
      }`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">{t('grace', 'initializing', "Initializing GraceCounsel...")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg flex overflow-hidden relative ${
      Capacitor.isNativePlatform() ? 'h-[calc(100vh-130px)]' : 'h-[600px]'
    }`}>
      <style>{`
        .gc-markdown p { margin: 0 0 0.5rem; }
        .gc-markdown p:last-child { margin-bottom: 0; }
        .gc-markdown ul, .gc-markdown ol { margin: 0 0 0.5rem 1.1rem; list-style: revert; }
        .gc-markdown li { margin: 0.15rem 0; }
        .gc-markdown strong { font-weight: 700; }
        .gc-markdown em { font-style: italic; }
        .gc-markdown a { text-decoration: underline; }
        .gc-markdown h1,.gc-markdown h2,.gc-markdown h3 { font-weight: 700; margin: 0.35rem 0 0.25rem; }
        .gc-markdown code { background: rgba(0,0,0,0.06); padding: 0 0.25rem; border-radius: 0.25rem; }
        .gc-markdown blockquote { border-left: 3px solid #d8b4fe; padding-left: 0.6rem; color: #6b21a8; margin: 0 0 0.5rem; }
      `}</style>

      {/* Backdrop for mobile drawer */}
      {Capacitor.isNativePlatform() && sidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/40 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sessions sidebar */}
      <div className={`border-r flex flex-col bg-gray-50 shrink-0 transition-all duration-300 ${
        Capacitor.isNativePlatform()
          ? `absolute inset-y-0 left-0 w-64 shadow-xl z-30 transform ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`
          : 'w-56 sm:w-64'
      }`}>
        <div className="p-3 border-b space-y-2">
          <button
            onClick={startNewSession}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('grace', 'newSession', "New Session")}
          </button>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('grace', 'searchConversations', "Search conversations…")}
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center mt-6">
              {search ? t('grace', 'noMatch', "No conversations match your search.") : t('grace', 'noConversations', "No conversations yet.")}
            </p>
          ) : (
            filteredSessions.map(s => (
              <button
                key={s.id}
                onClick={() => selectSession(s)}
                className={`w-full text-left p-2 rounded-lg transition-colors ${
                  s.id === sessionId ? 'bg-purple-100 border border-purple-200' : 'hover:bg-gray-100'
                }`}
              >
                <p className="text-xs font-medium text-gray-800 truncate">{s.title || t('grace', 'conversation', "Conversation")}</p>
                {s.last_message && (
                  <p className="text-[11px] text-gray-500 truncate">{s.last_message}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(s.updated_at || s.created_at).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-4 flex items-center gap-3">
          {Capacitor.isNativePlatform() && (
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="p-1 rounded hover:bg-white/10 shrink-0"
              aria-label="Toggle chat history"
            >
              <Menu className="h-6 w-6" />
            </button>
          )}
          <div>
            <h3 className="font-bold text-lg">GraceCounsel AI</h3>
            <p className="text-sm opacity-90">{t('grace', 'subtitle', "Your Scripture-rooted spiritual companion")}</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="m-4 mb-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="text-sm gc-markdown" dangerouslySetInnerHTML={{ __html: toHtml(msg.content) }} />
                )}
                {msg.scripture && (
                  <p className="text-xs mt-2 opacity-75 italic border-t border-current pt-2">— {msg.scripture}</p>
                )}
                <p className="text-xs mt-1 opacity-60">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                <span className="text-sm text-gray-600">{t('grace', 'responding', "GraceCounsel is responding...")}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('grace', 'inputPlaceholder', "Share what's on your heart...")}
              disabled={isLoading}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {!Capacitor.isNativePlatform() && (
                <span>{isLoading ? t('grace', 'sending', "Sending") : t('common', 'send', 'Send')}</span>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            {t('grace', 'poweredBy', "Powered by OpenAI • All conversations are private and secure")}
          </p>
        </div>
      </div>
    </div>
  );
};
