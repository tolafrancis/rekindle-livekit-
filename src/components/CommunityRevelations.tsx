import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { ScriptureSelector, ScriptureReference } from './ScriptureSelector';
import { CommentSection, Comment } from './CommentSection';
import { SocialShareModal } from './SocialShareModal';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { supabase } from '@/lib/supabase';
import {
  Book, Heart, MessageCircle, Share2, Send, Bookmark, BookmarkCheck,
  X, Download, Search, Lock, Crown, Loader2, Star, Sparkles,
  HelpCircle, CheckCircle2, ChevronDown, ChevronUp, ThumbsUp, Plus
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { UpgradePromptModal } from './UpgradePromptModal';
import { toast } from './ui/use-toast';
import { Badge } from './ui/badge';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Revelation {
  id: string;
  user_id: string;
  author: string;
  avatar: string;
  title: string;
  content: string;
  scriptures: ScriptureReference[];
  likes: number;
  comments: Comment[];
  created_at: string;
  liked: boolean;
  bookmarked: boolean;
  is_published: boolean;
  is_hidden: boolean;
}

interface Testimony {
  id: string;
  user_id: string;
  author: string;
  avatar: string;
  title: string;
  content: string;
  category: string;
  likes: number;
  comments: Comment[];
  created_at: string;
  liked: boolean;
  bookmarked: boolean;
  is_published: boolean;
  is_hidden: boolean;
}

const TESTIMONY_CATEGORIES = [
  'Healing', 'Provision', 'Restoration', 'Salvation',
  'Deliverance', 'Answered Prayer', 'Breakthrough', 'Protection', 'Other',
];

interface QAnswer {
  id: string;
  question_id: string;
  user_id: string;
  author: string;
  avatar: string;
  content: string;
  upvotes: number;
  upvoted: boolean;
  is_accepted: boolean;
  created_at: string;
}

interface Question {
  id: string;
  user_id: string;
  author: string;
  avatar: string;
  title: string;
  content: string;
  scripture_context: string;
  upvotes: number;
  upvoted: boolean;
  answers: QAnswer[];
  is_resolved: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export const CommunityRevelations: React.FC = () => {
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();

  const [activeTab, setActiveTab] = useState<'revelations' | 'testimonies' | 'qa'>('revelations');
  const { activePrompt, show: showUpgradePrompt, dismiss: dismissUpgradePrompt } = useUpgradePrompt();

  // ── Q&A state ──
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qaLoading, setQaLoading] = useState(true);
  const [showQForm, setShowQForm] = useState(false);
  const [qTitle, setQTitle] = useState('');
  const [qContent, setQContent] = useState('');
  const [qScripture, setQScripture] = useState('');
  const [qaFilter, setQaFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  // ── Revelations state ──
  const [revelations, setRevelations] = useState<Revelation[]>([]);
  const [revLoading, setRevLoading] = useState(true);
  const [showRevForm, setShowRevForm] = useState(false);
  const [revTitle, setRevTitle] = useState('');
  const [revContent, setRevContent] = useState('');
  const [scriptures, setScriptures] = useState<ScriptureReference[]>([]);
  const [expandedRevComments, setExpandedRevComments] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState<{ open: boolean; revelation: Revelation | null }>({ open: false, revelation: null });
  const [revFilter, setRevFilter] = useState<'all' | 'bookmarked'>('all');
  const [scriptureInput, setScriptureInput] = useState('');
  const [isScriptureLoading, setIsScriptureLoading] = useState(false);
  const [scriptureSuggestions, setScriptureSuggestions] = useState<ScriptureReference[]>([]);

  // ── Testimonies state ──
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [testLoading, setTestLoading] = useState(true);
  const [testTableReady, setTestTableReady] = useState(true);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testTitle, setTestTitle] = useState('');
  const [testContent, setTestContent] = useState('');
  const [testCategory, setTestCategory] = useState('Other');
  const [expandedTestComments, setExpandedTestComments] = useState<string | null>(null);
  const [testFilter, setTestFilter] = useState<'all' | 'bookmarked'>('all');
  const [testShareModal, setTestShareModal] = useState<{ open: boolean; testimony: Testimony | null }>({ open: false, testimony: null });

  const revWordCount = revContent.trim().split(/\s+/).filter(w => w).length;
  const testWordCount = testContent.trim().split(/\s+/).filter(w => w).length;
  const canShareRevelations = entitlements.canShareRevelations;

  useEffect(() => {
    loadRevelations();
    loadTestimonies();
    loadQuestions();
  }, []);

  // ─────────────────────────────────────────────
  // Revelations helpers
  // ─────────────────────────────────────────────

  const loadRevelations = async () => {
    setRevLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_revelations')
        .select('*')
        .eq('is_published', true)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRevelations((data || []).map(rev => ({ ...rev, liked: false, bookmarked: false })));
    } catch (err: any) {
      toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'failedLoadRevelations', 'Failed to load revelations'), variant: 'destructive' });
    } finally {
      setRevLoading(false);
    }
  };

  const handleRevLike = async (id: string) => {
    const rev = revelations.find(r => r.id === id);
    if (!rev) return;
    const newLiked = !rev.liked;
    const newCount = newLiked ? rev.likes + 1 : rev.likes - 1;
    setRevelations(prev => prev.map(r => r.id === id ? { ...r, likes: newCount, liked: newLiked } : r));
    try {
      const { error } = await supabase.from('community_revelations').update({ likes: newCount }).eq('id', id);
      if (error) throw error;
    } catch {
      setRevelations(prev => prev.map(r => r.id === id ? { ...r, likes: rev.likes, liked: rev.liked } : r));
      toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'failedUpdateLike', 'Failed to update like'), variant: 'destructive' });
    }
  };

  const handleRevBookmark = (id: string) => {
    const rev = revelations.find(r => r.id === id);
    setRevelations(prev => prev.map(r => r.id === id ? { ...r, bookmarked: !r.bookmarked } : r));
    toast({ title: rev?.bookmarked ? t('communityRevelations', 'removedFromBookmarks', 'Removed from Bookmarks') : t('communityRevelations', 'bookmarked', 'Bookmarked!'), description: rev?.bookmarked ? t('communityRevelations', 'revelationRemovedFromBookmarks', 'Revelation removed from bookmarks') : t('communityRevelations', 'revelationSavedToBookmarks', 'Revelation saved to bookmarks') });
  };

  const handleRevAddComment = async (revId: string, commentContent: string) => {
    if (!profile || !user) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'mustBeLoggedInComment', 'You must be logged in to comment'), variant: 'destructive' }); return; }
    const newComment: Comment = {
      id: Date.now().toString(),
      author: profile.full_name || 'Anonymous',
      avatar: (profile.full_name || 'A').split(' ').map(n => n[0]).join('').slice(0, 2),
      content: commentContent,
      timestamp: 'Just now',
    };
    setRevelations(prev => prev.map(r => r.id === revId ? { ...r, comments: [...r.comments, newComment] } : r));
    try {
      const revelation = revelations.find(r => r.id === revId);
      if (!revelation) return;
      const { error } = await supabase.from('community_revelations').update({ comments: [...revelation.comments, newComment] }).eq('id', revId);
      if (error) throw error;
    } catch {
      loadRevelations();
      toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'failedAddComment', 'Failed to add comment'), variant: 'destructive' });
    }
  };

  const handleRevDeleteComment = async (revId: string, commentId: string) => {
    setRevelations(prev => prev.map(r => r.id === revId ? { ...r, comments: r.comments.filter(c => c.id !== commentId) } : r));
    try {
      const revelation = revelations.find(r => r.id === revId);
      if (!revelation) return;
      const { error } = await supabase.from('community_revelations').update({ comments: revelation.comments.filter(c => c.id !== commentId) }).eq('id', revId);
      if (error) throw error;
    } catch {
      loadRevelations();
      toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'failedDeleteComment', 'Failed to delete comment'), variant: 'destructive' });
    }
  };

  const handleRevSubmit = async () => {
    if (!profile || !user) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'mustBeLoggedInShare', 'You must be logged in to share'), variant: 'destructive' }); return; }
    if (!canShareRevelations) { toast({ title: t('communityRevelations', 'premiumFeature', 'Premium Feature'), description: t('communityRevelations', 'sharingRequiresPremium', 'Sharing revelations requires a Premium subscription'), variant: 'destructive' }); return; }
    if (!revTitle.trim() || !revContent.trim()) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'fillAllFields', 'Please fill in all fields'), variant: 'destructive' }); return; }
    if (scriptures.length === 0) { toast({ title: t('communityRevelations', 'scriptureRequired', 'Scripture Required'), description: t('communityRevelations', 'addAtLeastOneScripture', 'Please add at least one scripture reference'), variant: 'destructive' }); return; }
    const avatar = (profile.full_name || 'A').split(' ').map(n => n[0]).join('').slice(0, 2);
    try {
      const { data, error } = await supabase.from('community_revelations').insert({
        user_id: user.id, author: profile.full_name || 'Anonymous', avatar,
        title: revTitle, content: revContent, scriptures, likes: 0, comments: [],
        is_published: true, is_hidden: false,
      }).select().single();
      if (error) throw error;
      if (data) setRevelations(prev => [{ ...data, liked: false, bookmarked: false }, ...prev]);
      setRevTitle(''); setRevContent(''); setScriptures([]); setShowRevForm(false);
      toast({ title: t('communityRevelations', 'revelationShared', 'Revelation Shared!'), description: t('communityRevelations', 'insightPosted', 'Your insight has been posted to the community') });
    } catch (err: any) {
      toast({ title: t('communityRevelations', 'error', 'Error'), description: err.message || t('communityRevelations', 'failedShareRevelation', 'Failed to share revelation'), variant: 'destructive' });
    }
  };

  const searchScriptures = async (query: string) => {
    if (!query.trim()) { setScriptureSuggestions([]); return; }
    setIsScriptureLoading(true);
    setTimeout(() => {
      const suggestions: ScriptureReference[] = [
        { reference: 'John 3:16', text: 'For God so loved the world...', version: 'KJV' },
        { reference: 'Psalm 23:1', text: 'The Lord is my shepherd...', version: 'NIV' },
        { reference: 'Matthew 6:33', text: 'But seek first the kingdom of God...', version: 'NIV' },
        { reference: 'Philippians 4:13', text: 'I can do all things through Christ...', version: 'ESV' },
        { reference: 'Romans 8:28', text: 'And we know that all things work together for good...', version: 'KJV' },
      ].filter(s => s.reference.toLowerCase().includes(query.toLowerCase()) || s.text.toLowerCase().includes(query.toLowerCase()));
      setScriptureSuggestions(suggestions);
      setIsScriptureLoading(false);
    }, 500);
  };

  const handleScriptureInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setScriptureInput(value);
    if (value.length > 2) searchScriptures(value);
    else setScriptureSuggestions([]);
  };

  const handleAddScripture = (scripture: ScriptureReference) => {
    if (!scriptures.some(s => s.reference === scripture.reference)) {
      setScriptures([...scriptures, scripture]);
      setScriptureInput(''); setScriptureSuggestions([]);
    } else {
      toast({ title: t('communityRevelations', 'alreadyAdded', 'Already Added'), description: t('communityRevelations', 'scriptureRefAlreadyAdded', 'This scripture reference has already been added') });
    }
  };

  const handleRemoveScripture = (index: number) => setScriptures(scriptures.filter((_, i) => i !== index));

  const handleDownloadScripture = async () => {
    if (!scriptureInput.trim()) { toast({ title: t('communityRevelations', 'enterScripture', 'Enter Scripture'), description: t('communityRevelations', 'enterScriptureToDownload', 'Please enter a scripture reference to download'), variant: 'destructive' }); return; }
    setIsScriptureLoading(true);
    setTimeout(() => {
      const fetched: ScriptureReference = {
        reference: scriptureInput,
        text: `This is the text for ${scriptureInput}. For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.`,
        version: 'NIV',
      };
      if (!scriptures.some(s => s.reference === fetched.reference)) {
        setScriptures([...scriptures, fetched]);
        setScriptureInput(''); setScriptureSuggestions([]);
        toast({ title: t('communityRevelations', 'scriptureDownloaded', 'Scripture Downloaded'), description: t('communityRevelations', 'scriptureAddedToYours', '{ref} has been added to your scriptures').replace('{ref}', scriptureInput) });
      } else {
        toast({ title: t('communityRevelations', 'alreadyAdded', 'Already Added'), description: t('communityRevelations', 'scriptureAlreadyInList', 'This scripture is already in your list') });
      }
      setIsScriptureLoading(false);
    }, 800);
  };

  // ─────────────────────────────────────────────
  // Testimonies helpers
  // ─────────────────────────────────────────────

  const loadTestimonies = async () => {
    setTestLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_testimonies')
        .select('*')
        .eq('is_published', true)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Testimonies load error:', error.message);
        setTestimonies([]);
        return;
      }
      setTestimonies((data || []).map(t => ({ ...t, liked: false, bookmarked: false })));
    } catch (err: any) {
      console.error('Error loading testimonies:', err);
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestLike = async (id: string) => {
    const test = testimonies.find(t => t.id === id);
    if (!test) return;
    const newLiked = !test.liked;
    const newCount = newLiked ? test.likes + 1 : test.likes - 1;
    setTestimonies(prev => prev.map(t => t.id === id ? { ...t, likes: newCount, liked: newLiked } : t));
    try {
      const { error } = await supabase.from('app_testimonies').update({ likes: newCount }).eq('id', id);
      if (error) throw error;
    } catch {
      setTestimonies(prev => prev.map(t => t.id === id ? { ...t, likes: test.likes, liked: test.liked } : t));
      toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'failedUpdateLike', 'Failed to update like'), variant: 'destructive' });
    }
  };

  const handleTestBookmark = (id: string) => {
    const test = testimonies.find(t => t.id === id);
    setTestimonies(prev => prev.map(t => t.id === id ? { ...t, bookmarked: !t.bookmarked } : t));
    toast({ title: test?.bookmarked ? t('communityRevelations', 'removedFromBookmarks', 'Removed from Bookmarks') : t('communityRevelations', 'bookmarked', 'Bookmarked!'), description: test?.bookmarked ? t('communityRevelations', 'testimonyRemovedFromBookmarks', 'Testimony removed from bookmarks') : t('communityRevelations', 'testimonySavedToBookmarks', 'Testimony saved to bookmarks') });
  };

  const handleTestAddComment = async (testId: string, commentContent: string) => {
    if (!profile || !user) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'mustBeLoggedInComment', 'You must be logged in to comment'), variant: 'destructive' }); return; }
    const newComment: Comment = {
      id: Date.now().toString(),
      author: profile.full_name || 'Anonymous',
      avatar: (profile.full_name || 'A').split(' ').map(n => n[0]).join('').slice(0, 2),
      content: commentContent,
      timestamp: 'Just now',
    };
    setTestimonies(prev => prev.map(t => t.id === testId ? { ...t, comments: [...t.comments, newComment] } : t));
    try {
      const testimony = testimonies.find(t => t.id === testId);
      if (!testimony) return;
      const { error } = await supabase.from('app_testimonies').update({ comments: [...testimony.comments, newComment] }).eq('id', testId);
      if (error) throw error;
    } catch {
      loadTestimonies();
      toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'failedAddComment', 'Failed to add comment'), variant: 'destructive' });
    }
  };

  const handleTestDeleteComment = async (testId: string, commentId: string) => {
    setTestimonies(prev => prev.map(t => t.id === testId ? { ...t, comments: t.comments.filter(c => c.id !== commentId) } : t));
    try {
      const testimony = testimonies.find(t => t.id === testId);
      if (!testimony) return;
      const { error } = await supabase.from('app_testimonies').update({ comments: testimony.comments.filter(c => c.id !== commentId) }).eq('id', testId);
      if (error) throw error;
    } catch {
      loadTestimonies();
      toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'failedDeleteComment', 'Failed to delete comment'), variant: 'destructive' });
    }
  };

  const handleTestSubmit = async () => {
    if (!profile || !user) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'mustBeLoggedInShare', 'You must be logged in to share'), variant: 'destructive' }); return; }
    if (!testTitle.trim() || !testContent.trim()) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'fillAllFields', 'Please fill in all fields'), variant: 'destructive' }); return; }
    const avatar = (profile.full_name || 'A').split(' ').map(n => n[0]).join('').slice(0, 2);
    try {
      const { data, error } = await supabase.from('app_testimonies').insert({
        user_id: user.id,
        author: profile.full_name || 'Anonymous',
        avatar,
        title: testTitle,
        content: testContent,
        category: testCategory,
        likes: 0,
        comments: [],
        is_published: true,
        is_hidden: false,
      }).select().single();
      if (error) throw error;
      if (data) setTestimonies(prev => [{ ...data, liked: false, bookmarked: false }, ...prev]);
      setTestTitle(''); setTestContent(''); setTestCategory('Other'); setShowTestForm(false);
      toast({ title: t('communityRevelations', 'testimonyShared', 'Testimony Shared!'), description: t('communityRevelations', 'testimonyPosted', 'Your testimony has been posted to the community') });
    } catch (err: any) {
      toast({ title: t('communityRevelations', 'error', 'Error'), description: err.message || t('communityRevelations', 'failedShareTestimony', 'Failed to share testimony'), variant: 'destructive' });
    }
  };

  // ─────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────

  const filteredRevelations = revFilter === 'bookmarked' ? revelations.filter(r => r.bookmarked) : revelations;
  const filteredTestimonies = testFilter === 'bookmarked' ? testimonies.filter(t => t.bookmarked) : testimonies;

  const getShareUrl = (id: string) => `${window.location.origin}/revelations/${id}`;
  const getTestShareUrl = (id: string) => `${window.location.origin}/testimonies/${id}`;

  const categoryColor = (cat: string) => {
    const map: Record<string, string> = {
      Healing: 'bg-green-100 text-green-700 border-green-200',
      Provision: 'bg-blue-100 text-blue-700 border-blue-200',
      Restoration: 'bg-teal-100 text-teal-700 border-teal-200',
      Salvation: 'bg-purple-100 text-purple-700 border-purple-200',
      Deliverance: 'bg-red-100 text-red-700 border-red-200',
      'Answered Prayer': 'bg-amber-100 text-amber-700 border-amber-200',
      Breakthrough: 'bg-orange-100 text-orange-700 border-orange-200',
      Protection: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      Other: 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return map[cat] ?? map['Other'];
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // Q&A helpers
  // ─────────────────────────────────────────────

  const loadQuestions = async () => {
    setQaLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_questions')
        .select('*, community_answers(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setQuestions((data || []).map(q => ({
        ...q,
        upvoted: false,
        answers: (q.community_answers || []).map((a: any) => ({ ...a, upvoted: false })),
      })));
    } catch {
      setQuestions([]);
    } finally {
      setQaLoading(false);
    }
  };

  const handleUpvoteQuestion = async (id: string) => {
    const q = questions.find(q => q.id === id);
    if (!q) return;
    const newUpvoted = !q.upvoted;
    const newCount = q.upvotes + (newUpvoted ? 1 : -1);
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, upvotes: newCount, upvoted: newUpvoted } : q));
    await supabase.from('community_questions').update({ upvotes: newCount }).eq('id', id);
  };

  const handleUpvoteAnswer = async (questionId: string, answerId: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== questionId) return q;
      return {
        ...q,
        answers: q.answers.map(a => {
          if (a.id !== answerId) return a;
          const newUpvoted = !a.upvoted;
          const newCount = a.upvotes + (newUpvoted ? 1 : -1);
          supabase.from('community_answers').update({ upvotes: newCount }).eq('id', answerId);
          return { ...a, upvotes: newCount, upvoted: newUpvoted };
        }),
      };
    }));
  };

  const handleAcceptAnswer = async (questionId: string, answerId: string) => {
    if (!user) return;
    const q = questions.find(q => q.id === questionId);
    if (!q || q.user_id !== user.id) return;
    await supabase.from('community_answers').update({ is_accepted: false }).eq('question_id', questionId);
    await supabase.from('community_answers').update({ is_accepted: true }).eq('id', answerId);
    await supabase.from('community_questions').update({ is_resolved: true }).eq('id', questionId);
    setQuestions(prev => prev.map(q => {
      if (q.id !== questionId) return q;
      return {
        ...q,
        is_resolved: true,
        answers: q.answers.map((a: any) => ({ ...a, is_accepted: a.id === answerId })),
      };
    }));
    toast({ title: t('communityRevelations', 'answerAccepted', 'Answer accepted'), description: t('communityRevelations', 'questionMarkedResolved', 'This question is now marked as resolved.') });

    // In-app only to the answer author — single declaration
    const ans = q?.answers.find((a: any) => a.id === answerId);
    if (ans && ans.user_id !== user.id) {
      notify({
        type: 'answer_accepted',
        title: t('communityRevelations', 'notifyAnswerAcceptedTitle', '\u2705 Your answer was accepted'),
        body: t('communityRevelations', 'notifyAnswerAcceptedBody', 'Your answer on "{title}" was marked as the accepted answer.').replace('{title}', q?.title?.slice(0, 60) ?? t('communityRevelations', 'aQuestion', 'a question')),
        userId: ans.user_id,
        link: '/community',
      });
    }
  };

  const handlePostAnswer = async (questionId: string) => {
    if (!user || !profile) return;
    const content = answerDrafts[questionId]?.trim();
    if (!content) return;
    const newAnswer = {
      question_id: questionId,
      user_id: user.id,
      author: profile.full_name || profile.username || 'Anonymous',
      avatar: profile.avatar_url || '',
      content,
      upvotes: 0,
      is_accepted: false,
    };
    const { data, error } = await supabase.from('community_answers').insert([newAnswer]).select().single();
    if (error) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'couldNotPostAnswer', 'Could not post answer.'), variant: 'destructive' }); return; }
    setAnswerDrafts(prev => ({ ...prev, [questionId]: '' }));
    setQuestions(prev => prev.map(q =>
      q.id === questionId
        ? { ...q, answers: [...q.answers, { ...data, upvoted: false }] }
        : q
    ));
    toast({ title: t('communityRevelations', 'answerPosted', 'Answer posted!') });

    // Push + in-app to question author only — single declaration
    const q = questions.find(q => q.id === questionId);
    if (q && q.user_id !== user?.id) {
      notify({
        type: 'answer_posted',
        title: t('communityRevelations', 'notifyAnswerPostedTitle', '\ud83d\udcac Someone answered your question'),
        body: t('communityRevelations', 'notifyAnswerPostedBody', '{name} answered: "{title}"')
          .replace('{name}', profile?.full_name || t('communityRevelations', 'aMember', 'A member'))
          .replace('{title}', `${q.title.slice(0, 60)}${q.title.length > 60 ? '\u2026' : ''}`),
        userId: q.user_id,
        senderName: profile?.full_name,
        link: '/community',
      });
    }
  };

  const handlePostQuestion = async () => {
    if (!user || !profile) return;
    if (!qTitle.trim() || !qContent.trim()) {
      toast({ title: t('communityRevelations', 'missingFields', 'Missing fields'), description: t('communityRevelations', 'addTitleAndQuestion', 'Please add a title and your question.'), variant: 'destructive' });
      return;
    }
    const newQ = {
      user_id: user.id,
      author: profile.full_name || profile.username || 'Anonymous',
      avatar: profile.avatar_url || '',
      title: qTitle.trim(),
      content: qContent.trim(),
      scripture_context: qScripture.trim(),
      upvotes: 0,
      is_resolved: false,
    };
    const { data, error } = await supabase.from('community_questions').insert([newQ]).select().single();
    if (error) { toast({ title: t('communityRevelations', 'error', 'Error'), description: t('communityRevelations', 'couldNotPostQuestion', 'Could not post question.'), variant: 'destructive' }); return; }
    setQuestions(prev => [{ ...data, upvoted: false, answers: [] }, ...prev]);
    setQTitle(''); setQContent(''); setQScripture('');
    setShowQForm(false);
    toast({ title: t('communityRevelations', 'questionPosted', 'Question posted!'), description: t('communityRevelations', 'communityWeighIn', 'The community will weigh in soon.') });

    notify({
      type: 'new_question',
      title: t('communityRevelations', 'notifyNewQuestionTitle', '\u2753 New Question \u2014 Seek Clarity'),
      body: t('communityRevelations', 'notifyNewQuestionBody', '{name} asks: "{title}"')
        .replace('{name}', profile?.full_name || t('communityRevelations', 'aMember', 'A member'))
        .replace('{title}', `${qTitle.trim().slice(0, 60)}${qTitle.trim().length > 60 ? '\u2026' : ''}`),
      targetAudience: 'all',
      senderName: profile?.full_name,
      link: '/community',
    });
  };

  return (    <div className="space-y-6">

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('revelations')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
            activeTab === 'revelations'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Book className="h-4 w-4" />
          {t('communityRevelations', 'tabRevelations', 'Revelations')}
        </button>
        <button
          onClick={() => setActiveTab('testimonies')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
            activeTab === 'testimonies'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          {t('communityRevelations', 'tabTestimonies', 'Testimonies')}
        </button>
        <button
          onClick={() => setActiveTab('qa')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
            activeTab === 'qa'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <HelpCircle className="h-4 w-4" />
          {t('communityRevelations', 'gotQuestionsSeekClarity', 'Got Questions? Seek Clarity')}
        </button>
      </div>

      {/* ══════════════════════ REVELATIONS TAB ══════════════════════ */}
      {activeTab === 'revelations' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant={revFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setRevFilter('all')}>{t('communityRevelations', 'filterAll', 'All')}</Button>
            <Button variant={revFilter === 'bookmarked' ? 'default' : 'outline'} size="sm" onClick={() => setRevFilter('bookmarked')}>
              <Bookmark className="h-4 w-4 mr-1" />{t('communityRevelations', 'filterBookmarked', 'Bookmarked')}
            </Button>
            <Button
              onClick={() => {
                if (!canShareRevelations) { return; }
                setShowRevForm(!showRevForm);
              }}
              disabled={false}
              className="ml-auto bg-purple-600 hover:bg-purple-700"
            >
              {!canShareRevelations && <Lock className="h-4 w-4 mr-2" />}
              {showRevForm ? t('communityRevelations', 'cancel', 'Cancel') : t('communityRevelations', 'shareRevelation', 'Share Revelation')}
            </Button>
          </div>

          {!canShareRevelations && (
            <></>
          )}

          {showRevForm && canShareRevelations && (
            <Card className="border-purple-200 bg-purple-50/50">
              <CardContent className="pt-6 space-y-4">
                <Input placeholder={t('communityRevelations', 'revelationTitlePlaceholder', 'Title of your revelation...')} value={revTitle} onChange={e => setRevTitle(e.target.value)} />
                <div>
                  <Textarea
                    placeholder={t('communityRevelations', 'revelationContentPlaceholder', 'Share your thoughts (max 150 words)...')}
                    value={revContent}
                    onChange={e => {
                      const words = e.target.value.trim().split(/\s+/).filter(w => w);
                      if (words.length <= 150) setRevContent(e.target.value);
                    }}
                    rows={4}
                  />
                  <p className={`text-xs mt-1 ${revWordCount >= 150 ? 'text-red-500' : 'text-gray-500'}`}>{t('communityRevelations', 'wordsCount150', '{count}/150 words').replace('{count}', String(revWordCount))}</p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2 text-purple-700">{t('communityRevelations', 'scriptureReferencesRequired', 'Scripture References (Required)')}</p>
                  <div className="relative mb-4">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input placeholder={t('communityRevelations', 'searchScripturesPlaceholder', 'Search scriptures (e.g., John 3:16)...')} value={scriptureInput} onChange={handleScriptureInputChange} className="pl-9 pr-10" />
                        {isScriptureLoading && <div className="absolute right-3 top-1/2 transform -translate-y-1/2"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>}
                      </div>
                      <Button type="button" variant="outline" size="sm" className="h-10 px-3 flex items-center gap-1 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={handleDownloadScripture} disabled={isScriptureLoading}>
                        {isScriptureLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        <span className="text-xs">{t('communityRevelations', 'fetch', 'Fetch')}</span>
                      </Button>
                    </div>
                    {scriptureSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {scriptureSuggestions.map((s, i) => (
                          <button key={i} type="button" className="w-full text-left px-4 py-2 hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0" onClick={() => handleAddScripture(s)}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm text-purple-700">{s.reference}</span>
                              <Badge variant="outline" className="text-xs h-5">{s.version}</Badge>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 truncate italic">"{s.text}"</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {scriptures.length > 0 ? (
                    <div className="space-y-2 mb-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t('communityRevelations', 'addedScriptures', 'Added Scriptures')}</p>
                        <Button variant="ghost" size="sm" onClick={() => setScriptures([])} className="h-6 text-xs gap-1 text-red-500 hover:text-red-600"><X className="h-3 w-3" />{t('communityRevelations', 'clearAll', 'Clear All')}</Button>
                      </div>
                      {scriptures.map((scripture, index) => (
                        <div key={index} className="flex items-start justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg group hover:bg-amber-100/50 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">{index + 1}</div>
                              <span className="font-medium text-amber-800 text-sm"><Book className="h-3 w-3 inline mr-1" />{scripture.reference} ({scripture.version})</span>
                              <Badge variant="outline" className="text-xs h-5">{scripture.version}</Badge>
                            </div>
                            <p className="text-sm text-gray-700 italic mt-1 ml-7">"{scripture.text}"</p>
                          </div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500" onClick={() => handleRemoveScripture(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg mb-4 bg-gray-50/50">
                      <Book className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-500">{t('communityRevelations', 'noScripturesYet', 'No scriptures added yet')}</p>
                      <p className="text-gray-400 text-sm mt-1">{t('communityRevelations', 'useFetchToAdd', 'Use the Fetch button above to add scriptures')}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                    <span>{(scriptures.length === 1 ? t('communityRevelations', 'scriptureSelectedOne', '{count} scripture selected') : t('communityRevelations', 'scriptureSelectedMany', '{count} scriptures selected')).replace('{count}', String(scriptures.length))}</span>
                    <span className={scriptures.length === 0 ? 'text-red-500' : 'text-green-600'}>{scriptures.length === 0 ? t('communityRevelations', 'atLeastOneRequired', 'At least 1 required') : t('communityRevelations', 'readyToPost', 'Ready to post')}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => { setShowRevForm(false); setRevTitle(''); setRevContent(''); setScriptures([]); }} className="flex-1">{t('communityRevelations', 'cancel', 'Cancel')}</Button>
                  <Button onClick={handleRevSubmit} disabled={scriptures.length === 0} className="flex-1 bg-purple-600 hover:bg-purple-700">
                    <Send className="h-4 w-4 mr-2" />{t('communityRevelations', 'postRevelation', 'Post Revelation')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {revLoading ? (
            <Card><CardContent className="p-8 text-center">
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-2"></div>
                <p className="text-gray-500">{t('communityRevelations', 'loadingRevelations', 'Loading revelations...')}</p>
              </div>
            </CardContent></Card>
          ) : filteredRevelations.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <Book className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">{revFilter === 'bookmarked' ? t('communityRevelations', 'noBookmarkedRevelations', 'No bookmarked revelations found.') : t('communityRevelations', 'noRevelationsFound', 'No revelations found.')}</p>
              {revFilter === 'bookmarked' && <p className="text-sm text-gray-400 mt-1">{t('communityRevelations', 'bookmarkRevelationsHint', 'Bookmark revelations to see them here')}</p>}
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {filteredRevelations.map(rev => (
                <Card key={rev.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold flex-shrink-0">{rev.avatar}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{rev.author}</h3>
                            <span className="text-sm text-gray-500">{new Date(rev.created_at).toLocaleDateString()}</span>
                          </div>
                          <button onClick={() => handleRevBookmark(rev.id)} className={`${rev.bookmarked ? 'text-purple-600' : 'text-gray-400 hover:text-purple-600'}`}>
                            {rev.bookmarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
                          </button>
                        </div>
                        <h4 className="text-lg font-medium text-purple-700 mb-2">{rev.title}</h4>
                        <p className="text-gray-700 mb-3">{rev.content}</p>
                        <div className="space-y-2 mb-4">
                          {rev.scriptures.map((s, index) => (
                            <div key={s.reference} className="flex items-start p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="w-5 h-5 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">{index + 1}</div>
                                  <span className="inline-flex items-center gap-1 text-amber-800 font-medium text-sm"><Book className="h-3 w-3" />{s.reference} ({s.version})</span>
                                </div>
                                <p className="text-sm text-gray-700 italic mt-1 ml-7">"{s.text}"</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-4">
                          <button onClick={() => handleRevLike(rev.id)} className={`flex items-center gap-1 ${rev.liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}>
                            <Heart className={`h-5 w-5 ${rev.liked ? 'fill-current' : ''}`} />{rev.likes}
                          </button>
                          <button onClick={() => setExpandedRevComments(expandedRevComments === rev.id ? null : rev.id)} className="flex items-center gap-1 text-gray-500 hover:text-purple-500">
                            <MessageCircle className="h-5 w-5" />{rev.comments.length}
                          </button>
                          <button onClick={() => setShareModal({ open: true, revelation: rev })} className="flex items-center gap-1 text-gray-500 hover:text-blue-500">
                            <Share2 className="h-5 w-5" />{t('communityRevelations', 'share', 'Share')}
                          </button>
                        </div>
                        {expandedRevComments === rev.id && (
                          <CommentSection comments={rev.comments} onAddComment={c => handleRevAddComment(rev.id, c)} onDeleteComment={cId => handleRevDeleteComment(rev.id, cId)} />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TESTIMONIES TAB ══════════════════════ */}
      {activeTab === 'testimonies' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant={testFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTestFilter('all')}>{t('communityRevelations', 'filterAll', 'All')}</Button>
            <Button variant={testFilter === 'bookmarked' ? 'default' : 'outline'} size="sm" onClick={() => setTestFilter('bookmarked')}>
              <Bookmark className="h-4 w-4 mr-1" />{t('communityRevelations', 'filterBookmarked', 'Bookmarked')}
            </Button>
            <Button
              onClick={() => {
                if (!user) { toast({ title: t('communityRevelations', 'loginRequired', 'Login Required'), description: t('communityRevelations', 'loginToShareTestimony', 'Please log in to share a testimony'), variant: 'destructive' }); return; }
                setShowTestForm(!showTestForm);
              }}
              className="ml-auto bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {showTestForm ? t('communityRevelations', 'cancel', 'Cancel') : t('communityRevelations', 'shareTestimony', 'Share Testimony')}
            </Button>
          </div>

          {showTestForm && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <h3 className="font-semibold text-amber-800">{t('communityRevelations', 'shareYourTestimony', 'Share Your Testimony')}</h3>
                </div>
                <p className="text-sm text-amber-700">{t('communityRevelations', 'encourageOthers', 'Encourage others by sharing what God has done in your life.')}</p>

                <Input placeholder={t('communityRevelations', 'testimonyTitlePlaceholder', 'Title of your testimony...')} value={testTitle} onChange={e => setTestTitle(e.target.value)} className="border-amber-200 focus:border-amber-400" />

                <div>
                  <Textarea
                    placeholder={t('communityRevelations', 'testimonyContentPlaceholder', 'Tell us your testimony (max 200 words)...')}
                    value={testContent}
                    onChange={e => {
                      const words = e.target.value.trim().split(/\s+/).filter(w => w);
                      if (words.length <= 200) setTestContent(e.target.value);
                    }}
                    rows={5}
                    className="border-amber-200 focus:border-amber-400"
                  />
                  <p className={`text-xs mt-1 ${testWordCount >= 200 ? 'text-red-500' : 'text-gray-500'}`}>{t('communityRevelations', 'wordsCount200', '{count}/200 words').replace('{count}', String(testWordCount))}</p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2 text-amber-700">{t('communityRevelations', 'category', 'Category')}</p>
                  <div className="flex flex-wrap gap-2">
                    {TESTIMONY_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setTestCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                          testCategory === cat
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400 hover:text-amber-600'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => { setShowTestForm(false); setTestTitle(''); setTestContent(''); setTestCategory('Other'); }} className="flex-1">{t('communityRevelations', 'cancel', 'Cancel')}</Button>
                  <Button onClick={handleTestSubmit} className="flex-1 bg-amber-500 hover:bg-amber-600">
                    <Send className="h-4 w-4 mr-2" />{t('communityRevelations', 'postTestimony', 'Post Testimony')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {testLoading ? (
            <Card><CardContent className="p-8 text-center">
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mb-2"></div>
                <p className="text-gray-500">{t('communityRevelations', 'loadingTestimonies', 'Loading testimonies...')}</p>
              </div>
            </CardContent></Card>
          ) : filteredTestimonies.length === 0 ? (
            <Card><CardContent className="p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="font-semibold text-gray-700 mb-1">{testFilter === 'bookmarked' ? t('communityRevelations', 'noBookmarkedTestimonies', 'No bookmarked testimonies') : t('communityRevelations', 'noTestimoniesYet', 'No testimonies yet')}</h3>
              <p className="text-sm text-gray-400">{testFilter === 'bookmarked' ? t('communityRevelations', 'bookmarkTestimoniesHint', 'Bookmark testimonies to see them here') : t('communityRevelations', 'beFirstShareTestimony', 'Be the first to share what God has done!')}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {filteredTestimonies.map(test => (
                <Card key={test.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-amber-400">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold flex-shrink-0">{test.avatar}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{test.author}</h3>
                            <span className="text-sm text-gray-500">{new Date(test.created_at).toLocaleDateString()}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${categoryColor(test.category)}`}>{test.category}</span>
                          </div>
                          <button onClick={() => handleTestBookmark(test.id)} className={`${test.bookmarked ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}>
                            {test.bookmarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
                          </button>
                        </div>
                        <h4 className="text-lg font-medium text-amber-700 mb-2 flex items-center gap-1">
                          <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
                          {test.title}
                        </h4>
                        <p className="text-gray-700 leading-relaxed mb-4">{test.content}</p>
                        <div className="flex items-center gap-4">
                          <button onClick={() => handleTestLike(test.id)} className={`flex items-center gap-1 ${test.liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}>
                            <Heart className={`h-5 w-5 ${test.liked ? 'fill-current' : ''}`} />{test.likes}
                          </button>
                          <button onClick={() => setExpandedTestComments(expandedTestComments === test.id ? null : test.id)} className="flex items-center gap-1 text-gray-500 hover:text-amber-500">
                            <MessageCircle className="h-5 w-5" />{test.comments.length}
                          </button>
                          <button onClick={() => setTestShareModal({ open: true, testimony: test })} className="flex items-center gap-1 text-gray-500 hover:text-blue-500">
                            <Share2 className="h-5 w-5" />{t('communityRevelations', 'share', 'Share')}
                          </button>
                        </div>
                        {expandedTestComments === test.id && (
                          <CommentSection comments={test.comments} onAddComment={c => handleTestAddComment(test.id, c)} onDeleteComment={cId => handleTestDeleteComment(test.id, cId)} />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Share modals */}
      {shareModal.revelation && (
        <SocialShareModal
          isOpen={shareModal.open}
          onClose={() => setShareModal({ open: false, revelation: null })}
          title={shareModal.revelation.title}
          description={`${shareModal.revelation.content}\n\n${shareModal.revelation.scriptures.map(s => `${s.reference}: "${s.text}"`).join('\n')}`}
          url={getShareUrl(shareModal.revelation.id)}
        />
      )}

      {testShareModal.testimony && (
        <SocialShareModal
          isOpen={testShareModal.open}
          onClose={() => setTestShareModal({ open: false, testimony: null })}
          title={testShareModal.testimony.title}
          description={testShareModal.testimony.content}
          url={getTestShareUrl(testShareModal.testimony.id)}
        />
      )}

      {/* ══════════════════════ Q&A TAB ══════════════════════ */}
      {activeTab === 'qa' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-blue-700 flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                {t('communityRevelations', 'gotQuestionsSeekClarity', 'Got Questions? Seek Clarity')}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">{t('communityRevelations', 'askBiblicalQuestions', 'Ask biblical questions and receive insight from the community.')}</p>
            </div>
            {user && (
              <Button
                onClick={() => {
                  if (!canShareRevelations) { return; }
                  setShowQForm(v => !v);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('communityRevelations', 'askAQuestion', 'Ask a Question')}
              </Button>
            )}
          </div>

          {showQForm && (
            <Card className="border-blue-200 bg-blue-50/40">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-blue-800">{t('communityRevelations', 'yourQuestion', 'Your Question')}</h4>
                <Input value={qTitle} onChange={e => setQTitle(e.target.value)} placeholder={t('communityRevelations', 'questionTitlePlaceholder', 'Give your question a short title…')} className="bg-white" />
                <Textarea value={qContent} onChange={e => setQContent(e.target.value)} placeholder={t('communityRevelations', 'questionDetailPlaceholder', 'Describe your question in detail…')} rows={4} className="bg-white" />
                <Input value={qScripture} onChange={e => setQScripture(e.target.value)} placeholder={t('communityRevelations', 'relatedScripturePlaceholder', 'Related scripture (optional) e.g. Romans 8:28')} className="bg-white" />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowQForm(false)}>{t('communityRevelations', 'cancel', 'Cancel')}</Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handlePostQuestion}>
                    <Send className="h-4 w-4 mr-1" />{t('communityRevelations', 'postQuestion', 'Post Question')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2 flex-wrap">
            {(['all', 'open', 'resolved'] as const).map(f => (
              <Button key={f} variant={qaFilter === f ? 'default' : 'outline'} size="sm"
                onClick={() => setQaFilter(f)}
                className={qaFilter === f ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                {f === 'all' ? t('communityRevelations', 'filterAll', 'All') : f === 'open' ? t('communityRevelations', 'filterOpen', 'Open') : t('communityRevelations', 'filterResolved', '\u2713 Resolved')}
              </Button>
            ))}
          </div>

          {qaLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
          ) : (
            <div className="space-y-4">
              {questions
                .filter(q => qaFilter === 'all' ? true : qaFilter === 'open' ? !q.is_resolved : q.is_resolved)
                .map(q => (
                  <Card key={q.id} className={`border ${q.is_resolved ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {q.is_resolved && (
                              <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />{t('communityRevelations', 'resolved', 'Resolved')}
                              </Badge>
                            )}
                            <span className="text-xs text-gray-400">{q.author} \u00b7 {new Date(q.created_at).toLocaleDateString()}</span>
                          </div>
                          <h4 className="font-semibold text-gray-900 break-words">{q.title}</h4>
                          <p className="text-sm text-gray-600 mt-1 break-words">{q.content}</p>
                          {q.scripture_context && <p className="text-xs text-blue-600 mt-1 italic">\U0001f4d6 {q.scripture_context}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <button onClick={() => handleUpvoteQuestion(q.id)}
                          className={`flex items-center gap-1 transition-colors ${q.upvoted ? 'text-blue-600 font-semibold' : 'text-gray-500 hover:text-blue-500'}`}>
                          <ThumbsUp className={`h-4 w-4 ${q.upvoted ? 'fill-current' : ''}`} />
                          {q.upvotes}
                        </button>
                        <button onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors">
                          <MessageCircle className="h-4 w-4" />
                          {(q.answers.length === 1 ? t('communityRevelations', 'answerCountOne', '{count} answer') : t('communityRevelations', 'answerCountMany', '{count} answers')).replace('{count}', String(q.answers.length))}
                          {expandedQuestion === q.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>
                      {expandedQuestion === q.id && (
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                          {q.answers.length === 0 && <p className="text-sm text-gray-400 italic text-center py-2">{t('communityRevelations', 'noAnswersYet', 'No answers yet \u2014 be the first to share insight.')}</p>}
                          {q.answers
                            .slice()
                            .sort((a, b) => (b.is_accepted ? 1 : 0) - (a.is_accepted ? 1 : 0) || b.upvotes - a.upvotes)
                            .map(ans => (
                              <div key={ans.id} className={`rounded-lg p-3 space-y-2 ${ans.is_accepted ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                                {ans.is_accepted && (
                                  <div className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                                    <CheckCircle2 className="h-3.5 w-3.5" />{t('communityRevelations', 'acceptedAnswer', 'Accepted Answer')}
                                  </div>
                                )}
                                <p className="text-sm text-gray-800 break-words">{ans.content}</p>
                                <p className="text-xs text-gray-400">{ans.author} \u00b7 {new Date(ans.created_at).toLocaleDateString()}</p>
                                <div className="flex items-center gap-3">
                                  <button onClick={() => handleUpvoteAnswer(q.id, ans.id)}
                                    className={`flex items-center gap-1 text-xs transition-colors ${ans.upvoted ? 'text-blue-600 font-semibold' : 'text-gray-400 hover:text-blue-500'}`}>
                                    <ThumbsUp className={`h-3 w-3 ${ans.upvoted ? 'fill-current' : ''}`} />
                                    {t('communityRevelations', 'helpfulCount', '{count} helpful').replace('{count}', String(ans.upvotes))}
                                  </button>
                                  {user && q.user_id === user.id && !ans.is_accepted && (
                                    <button onClick={() => handleAcceptAnswer(q.id, ans.id)}
                                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">
                                      <CheckCircle2 className="h-3 w-3" />{t('communityRevelations', 'acceptAnswer', 'Accept answer')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          {user && (
                            <div className="flex gap-2 pt-1">
                              <Textarea value={answerDrafts[q.id] || ''} onChange={e => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                                placeholder={t('communityRevelations', 'shareInsightPlaceholder', 'Share your insight or understanding\u2026')} rows={2} className="flex-1 text-sm" />
                              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white self-end"
                                onClick={() => handlePostAnswer(q.id)} disabled={!answerDrafts[q.id]?.trim()}>
                                <Send className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                          {!user && <p className="text-xs text-gray-400 text-center py-1">{t('communityRevelations', 'signInToAnswer', 'Sign in to post an answer.')}</p>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              {questions.filter(q => qaFilter === 'all' ? true : qaFilter === 'open' ? !q.is_resolved : q.is_resolved).length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">{t('communityRevelations', 'noQuestionsYet', 'No questions yet.')}</p>
                  <p className="text-sm mt-1">{t('communityRevelations', 'beFirstSeekClarity', 'Be the first to seek clarity from the community.')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upgrade Prompt */}
      <UpgradePromptModal
        prompt={activePrompt}
        onClose={dismissUpgradePrompt}
        onUpgrade={() => {}}
      />
    </div>
  );
};