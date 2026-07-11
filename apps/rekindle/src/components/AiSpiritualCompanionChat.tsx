// src/components/AISpiritualCompanionChatUpdated.tsx
// Updated version that uses backend proxy - no API key needed in frontend
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Book, Heart, Sparkles, Archive, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SpiritualCompanionService, ChatMessage, ChatResponse } from '@/lib/AiSpiritualCompanionUpdated';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { checkAiLimit, type AiLimitStatus } from '@/lib/aiCompanionLimits';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  scriptureReference?: string;
  prayer?: string;
  created_at: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

export const AISpiritualCompanionChat: React.FC = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  
  // State management
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [spiritualCompanion, setSpiritualCompanion] = useState<SpiritualCompanionService | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [limitStatus, setLimitStatus] = useState<AiLimitStatus | null>(null);

  const refreshLimit = async () => {
    if (!user?.id) return;
    try {
      setLimitStatus(await checkAiLimit(user.id, (profile as any)?.subscription_tier));
    } catch { /* ignore — usage indicator is best-effort */ }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Initialize spiritual companion (no API key needed)
  useEffect(() => {
    initializeCompanion();
  }, []);

  // Load sessions + usage on mount
  useEffect(() => {
    if (user) {
      loadSessions();
      refreshLimit();
    }
  }, [user, (profile as any)?.subscription_tier]);

  // Load messages when session changes
  useEffect(() => {
    if (currentSession) {
      loadMessages(currentSession.id);
    }
  }, [currentSession]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeCompanion = () => {
    try {
      const companion = new SpiritualCompanionService();
      setSpiritualCompanion(companion);
      setConnectionError(null);
      
      // Test connection
      companion.testConnection()
        .then(success => {
          if (!success) {
            setConnectionError(t('aiSpiritualCompanionChat', 'unableToConnect', 'Unable to connect to spiritual companion service. Please try again later.'));
          }
        })
        .catch(err => {
          console.error('Connection test failed:', err);
        });
        
    } catch (error: any) {
      console.error('Initialization error:', error);
      setConnectionError(error.message);
      toast({
        title: t('aiSpiritualCompanionChat', 'initializationError', 'Initialization Error'),
        description: t('aiSpiritualCompanionChat', 'failedToInitialize', 'Failed to initialize spiritual companion. Please refresh the page.'),
        variant: 'destructive'
      });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_chat_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);

      // Auto-select first session or create new one
      if (data && data.length > 0) {
        setCurrentSession(data[0]);
      } else {
        await createNewSession();
      }
    } catch (error: any) {
      console.error('Error loading sessions:', error);
      toast({
        title: t('aiSpiritualCompanionChat', 'error', 'Error'),
        description: t('aiSpiritualCompanionChat', 'failedToLoadHistory', 'Failed to load conversation history'),
        variant: 'destructive'
      });
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      setMessages(data || []);
      
      // If no messages, add welcome message
      if (!data || data.length === 0) {
        await addWelcomeMessage(sessionId);
      }
    } catch (error: any) {
      console.error('Error loading messages:', error);
    }
  };

  const addWelcomeMessage = async (sessionId: string) => {
    const welcomeMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Welcome, beloved! I am your AI Spiritual Companion, here to journey with you in faith, rooted deeply in the Word of God. "Come to me, all you who are weary and burdened, and I will give you rest" (Matthew 11:28). How may I support you in your walk with Christ today?',
      scriptureReference: 'Matthew 11:28',
      created_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: sessionId,
          user_id: user?.id,
          role: welcomeMessage.role,
          content: welcomeMessage.content,
          scripture_reference: welcomeMessage.scriptureReference
        });

      if (!error) {
        setMessages([welcomeMessage]);
      }
    } catch (error) {
      console.error('Error adding welcome message:', error);
      setMessages([welcomeMessage]);
    }
  };

  const createNewSession = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_chat_sessions')
        .insert({
          user_id: user?.id,
          title: `Conversation ${new Date().toLocaleDateString()}`,
          metadata: {}
        })
        .select()
        .single();

      if (error) throw error;
      
      setCurrentSession(data);
      setSessions(prev => [data, ...prev]);
      setMessages([]);
      
      await addWelcomeMessage(data.id);
      
      toast({
        title: t('aiSpiritualCompanionChat', 'newConversationStarted', 'New Conversation Started'),
        description: t('aiSpiritualCompanionChat', 'beginSpiritualJourney', 'Begin your spiritual journey...')
      });
    } catch (error: any) {
      toast({
        title: t('aiSpiritualCompanionChat', 'error', 'Error'),
        description: t('aiSpiritualCompanionChat', 'failedToCreateSession', 'Failed to create new session'),
        variant: 'destructive'
      });
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !spiritualCompanion || !currentSession) return;

    // Fair-use enforcement: check the user's daily/monthly cap BEFORE sending.
    if (user?.id) {
      const status = await checkAiLimit(user.id, (profile as any)?.subscription_tier);
      setLimitStatus(status);
      if (!status.allowed) {
        const which = status.reason === 'monthly'
          ? t('aiSpiritualCompanionChat', 'limitMonthly', "You've reached your monthly message limit ({n}). It resets at the start of next month.").replace('{n}', String(status.monthLimit))
          : t('aiSpiritualCompanionChat', 'limitDaily', "You've reached today's message limit ({n}). It resets at midnight.").replace('{n}', String(status.dayLimit));
        const upgradeHint = status.tier === 'free' || status.tier === 'premium'
          ? ' ' + t('aiSpiritualCompanionChat', 'limitUpgrade', 'Upgrade for more daily conversations.')
          : '';
        toast({
          title: t('aiSpiritualCompanionChat', 'limitReachedTitle', 'Daily limit reached'),
          description: which + upgradeHint,
          variant: 'destructive',
        });
        return;
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString()
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setConnectionError(null);

    try {
      // Save user message to database
      await supabase.from('ai_chat_messages').insert({
        session_id: currentSession.id,
        user_id: user?.id,
        role: 'user',
        content: userMessage.content
      });

      // Get conversation history
      const conversationHistory: ChatMessage[] = messages
        .slice(-10) // Last 10 messages for context
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Add current message
      conversationHistory.push({
        role: 'user',
        content: userMessage.content
      });

      // Call AI Spiritual Companion via backend
      const response: ChatResponse = await spiritualCompanion.sendMessage(
        conversationHistory,
        {
          spiritualMaturity: 'growing', // Could be from user profile
          recentTopics: messages.slice(-5).map(m => m.content.slice(0, 50))
        }
      );

      // Create assistant message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.content,
        scriptureReference: response.scriptureReference,
        prayer: response.prayer,
        created_at: new Date().toISOString()
      };

      // Add to UI
      setMessages(prev => [...prev, assistantMessage]);

      // Save to database
      await supabase.from('ai_chat_messages').insert({
        session_id: currentSession.id,
        user_id: user?.id,
        role: 'assistant',
        content: assistantMessage.content,
        scripture_reference: assistantMessage.scriptureReference,
        prayer: assistantMessage.prayer,
        metadata: { tokensUsed: response.tokensUsed }
      });

      // Update session
      await supabase
        .from('ai_chat_sessions')
        .update({
          updated_at: new Date().toISOString(),
          last_message: userMessage.content.slice(0, 100)
        })
        .eq('id', currentSession.id);

    } catch (error: any) {
      console.error('Error sending message:', error);
      
      const errorMessage = error.message || t('aiSpiritualCompanionChat', 'failedToGetResponse', 'Failed to get response');
      setConnectionError(errorMessage);
      
      toast({
        title: t('aiSpiritualCompanionChat', 'connectionError', 'Connection Error'),
        description: errorMessage,
        variant: 'destructive'
      });

      // Remove the user message if sending failed
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
      refreshLimit(); // keep the usage indicator current
    }
  };

  const archiveSession = async (sessionId: string) => {
    try {
      await supabase
        .from('ai_chat_sessions')
        .update({ is_archived: true })
        .eq('id', sessionId);

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      if (currentSession?.id === sessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId);
        if (remainingSessions.length > 0) {
          setCurrentSession(remainingSessions[0]);
        } else {
          await createNewSession();
        }
      }

      toast({
        title: t('aiSpiritualCompanionChat', 'sessionArchived', 'Session Archived'),
        description: t('aiSpiritualCompanionChat', 'conversationArchived', 'Conversation has been archived')
      });
    } catch (error) {
      toast({
        title: t('aiSpiritualCompanionChat', 'error', 'Error'),
        description: t('aiSpiritualCompanionChat', 'failedToArchiveSession', 'Failed to archive session'),
        variant: 'destructive'
      });
    }
  };

  // Show error state if there's a connection issue
  if (connectionError && !spiritualCompanion) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 p-8">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <Heart className="w-8 h-8 text-red-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">{t('aiSpiritualCompanionChat', 'connectionError', 'Connection Error')}</h2>
            <p className="text-gray-600">{connectionError}</p>
          </div>
          <Alert variant="destructive">
            <AlertDescription>
              {t('aiSpiritualCompanionChat', 'pleaseMakeSure', 'Please make sure:')}
              <ul className="list-disc list-inside mt-2 text-left">
                <li>{t('aiSpiritualCompanionChat', 'stableInternet', 'You have a stable internet connection')}</li>
                <li>{t('aiSpiritualCompanionChat', 'edgeFunctionDeployed', 'The Supabase Edge Function is deployed')}</li>
                <li>{t('aiSpiritualCompanionChat', 'apiKeySet', 'The ANTHROPIC_API_KEY is set in Supabase')}</li>
              </ul>
            </AlertDescription>
          </Alert>
          <Button
            onClick={() => {
              setConnectionError(null);
              initializeCompanion();
            }}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('aiSpiritualCompanionChat', 'retryConnection', 'Retry Connection')}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Sidebar - Sessions List */}
      <div className="w-80 border-r bg-white/80 backdrop-blur-sm flex flex-col">
        <div className="p-4 border-b bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">{t('aiSpiritualCompanionChat', 'spiritualCompanion', 'Spiritual Companion')}</h2>
          </div>
          <p className="text-sm text-white/90">{t('aiSpiritualCompanionChat', 'yourAiGuide', 'Your AI guide in faith')}</p>
        </div>

        <div className="p-4">
          <Button
            onClick={createNewSession}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('aiSpiritualCompanionChat', 'newConversation', 'New Conversation')}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {sessions.map(session => (
              <Card
                key={session.id}
                className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                  currentSession?.id === session.id 
                    ? 'bg-gradient-to-r from-purple-100 to-blue-100 border-purple-300' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => setCurrentSession(session)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{session.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {session.last_message || t('aiSpiritualCompanionChat', 'noMessagesYet', 'No messages yet')}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(session.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveSession(session.id);
                    }}
                    className="flex-shrink-0"
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-sm border-b p-4">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              {currentSession?.title || t('aiSpiritualCompanionChat', 'selectAConversation', 'Select a conversation')}
            </h3>
            <p className="text-sm text-gray-600">{t('aiSpiritualCompanionChat', 'christCentered', 'Christ-centered · Scripture-rooted · Spirit-led')}</p>
          </div>
          
          {connectionError && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription className="text-xs">{connectionError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                      : 'bg-white shadow-md border border-gray-100'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2">
                      <Book className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-semibold text-purple-600">
                        {t('aiSpiritualCompanionChat', 'spiritualCompanion', 'Spiritual Companion')}
                      </span>
                    </div>
                  )}
                  
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' ? 'text-white' : 'text-gray-800'
                  }`}>
                    {msg.content}
                  </p>

                  {msg.scriptureReference && (
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                        <Book className="w-3 h-3 mr-1" />
                        {msg.scriptureReference}
                      </Badge>
                    </div>
                  )}

                  {msg.prayer && (
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      <p className="text-xs italic text-purple-700">
                        <Heart className="w-3 h-3 inline mr-1" />
                        {msg.prayer}
                      </p>
                    </div>
                  )}

                  <p className={`text-xs mt-2 ${
                    msg.role === 'user' ? 'text-white/70' : 'text-gray-400'
                  }`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white shadow-md border border-gray-100 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-purple-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">{t('aiSpiritualCompanionChat', 'seekingWisdom', 'Seeking wisdom...')}</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="bg-white/80 backdrop-blur-sm border-t p-4">
          {/* Fair-use limit banner */}
          {limitStatus && !limitStatus.allowed && (
            <div className="max-w-4xl mx-auto mb-3">
              <Alert variant="destructive">
                <AlertDescription>
                  {limitStatus.reason === 'monthly'
                    ? t('aiSpiritualCompanionChat', 'limitMonthly', "You've reached your monthly message limit ({n}). It resets at the start of next month.").replace('{n}', String(limitStatus.monthLimit))
                    : t('aiSpiritualCompanionChat', 'limitDaily', "You've reached today's message limit ({n}). It resets at midnight.").replace('{n}', String(limitStatus.dayLimit))}
                  {(limitStatus.tier === 'free' || limitStatus.tier === 'premium') && (
                    <> {t('aiSpiritualCompanionChat', 'limitUpgrade', 'Upgrade for more daily conversations.')}</>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}
          <div className="max-w-4xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder={
                limitStatus && !limitStatus.allowed
                  ? t('aiSpiritualCompanionChat', 'limitPlaceholder', 'Daily limit reached — come back tomorrow')
                  : t('aiSpiritualCompanionChat', 'shareOnYourHeart', "Share what's on your heart... (Press Enter to send)")
              }
              disabled={isLoading || !currentSession || !spiritualCompanion || (limitStatus ? !limitStatus.allowed : false)}
              className="flex-1 text-sm"
            />
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim() || !currentSession || !spiritualCompanion || (limitStatus ? !limitStatus.allowed : false)}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          {/* Usage indicator (only while some allowance remains) */}
          {limitStatus && limitStatus.allowed && limitStatus.remainingToday <= 5 && (
            <p className="text-xs text-amber-600 text-center mt-2">
              {t('aiSpiritualCompanionChat', 'messagesLeftToday', '{n} messages left today').replace('{n}', String(limitStatus.remainingToday))}
            </p>
          )}
          <p className="text-xs text-gray-500 text-center mt-2">
            {t('aiSpiritualCompanionChat', 'poweredByClaude', 'Powered by Claude · Rooted in Scripture · Guided by the Holy Spirit')}
          </p>
        </div>
      </div>
    </div>
  );
};

