import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Badge } from '@rekindle/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Slider } from '@rekindle/ui/slider';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@rekindle/ui/dropdown-menu';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';
import { 
  BookOpen, Star, Clock, Search, ChevronRight, Bookmark, Play, Pause, 
  Volume2, VolumeX, Headphones, SkipBack, SkipForward, FileText, 
  CheckCircle, Share2, Copy, Check, Send, Users, Award, TrendingUp,
  Gift, Zap, Lock, Crown, Loader2
} from 'lucide-react';
import { marked } from 'marked';
import { supabase } from '@rekindle/supabase';
import { consumeDeepLink } from '../deepLink';
import { toast } from '@rekindle/ui/use-toast';

// Render a book summary (authored as light markdown) to HTML: `##`/`**` become
// bold subheadings, blank lines become spaced paragraphs, `-` becomes bullets.
const renderSummaryHtml = (summary?: string | null): string => {
  if (!summary) return '';
  return marked.parse(summary, { async: false, gfm: true, breaks: true }) as string;
};

// Strip markdown tokens so the spoken (TTS) version doesn't read symbols aloud.
const stripMarkdown = (summary?: string | null): string => {
  if (!summary) return '';
  return summary
    .replace(/^#{1,6}\s+/gm, '')          // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // bold
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2') // italic
    .replace(/^\s*[-*+]\s+/gm, '')         // list bullets
    .replace(/`([^`]+)`/g, '$1')           // inline code
    .trim();
};
import { 
  postBookStarted,
  postBookCompleted
} from '../communityActivityService';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { useUpgradePrompt } from '@rekindle/auth/useUpgradePrompt';
import { UpgradePromptModal } from './UpgradePromptModal';
import { DialogFooter } from '@rekindle/ui/dialog';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from './SearchFilterPanel';

interface BookSummary {
  id: string;
  title: string;
  author: string;
  category: string;
  summary: string;
  key_takeaways: string[];
  cover_image_url: string;
  audio_url: string;
  pdf_url: string;
  is_published: boolean;
  created_at: string;
  translations?: Record<string, any>;
}

interface BookReferral {
  id: string;
  referrer_id: string;
  book_id: string;
  referred_user_id?: string;
  referral_code: string;
  clicks: number;
  conversions: number;
  created_at: string;
}

interface ReferralStats {
  total_referrals: number;
  total_clicks: number;
  total_conversions: number;
  books_shared: number;
}

// Share Button Component for Books
interface ShareBookButtonProps {
  book: BookSummary;
  referralCode?: string;
  onShareSuccess?: () => void;
}

const ShareBookButton: React.FC<ShareBookButtonProps> = ({ book, referralCode, onShareSuccess }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const shareUrl = referralCode
    ? `${window.location.origin}/books/${book.id}?ref=${referralCode}`
    : `${window.location.origin}/books/${book.id}`;

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`📚 Check out "${book.title}" by ${book.author}\n\n${shareUrl}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`📚 "${book.title}" by ${book.author}`)}&url=${encodeURIComponent(shareUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(`Check out "${book.title}"`)}&body=${encodeURIComponent(`I thought you might enjoy this book summary:\n\n"${book.title}" by ${book.author}\n\n${shareUrl}`)}`
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({
      title: t('bookSummaries', 'linkCopied', 'Link Copied!'),
      description: referralCode
        ? t('bookSummaries', 'referralLinkCopied', 'Your referral link has been copied')
        : t('bookSummaries', 'bookLinkCopied', 'Book link copied to clipboard')
    });
    setTimeout(() => setCopied(false), 2000);
    if (onShareSuccess) onShareSuccess();
  };

  // Radix DropdownMenu portals the menu to <body> so it is never clipped by a
  // card's `overflow-hidden` (which made the old menu appear unclickable).
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="hover:bg-purple-50 hover:border-purple-300 transition-colors"
        >
          <Share2 className="h-4 w-4 mr-2" />
          {t('bookSummaries', 'share', 'Share')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        {referralCode && (
          <>
            <DropdownMenuLabel className="flex items-center gap-1 text-purple-800">
              <Gift className="h-3 w-3" /> {t('bookSummaries', 'referralLinkLabel', 'Referral Link — track your shares!')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3" onClick={() => onShareSuccess?.()}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500"><Send className="h-4 w-4 text-white" /></span>
            WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3" onClick={() => onShareSuccess?.()}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">f</span>
            Facebook
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={shareLinks.x} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3" onClick={() => onShareSuccess?.()}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-sm font-bold text-white">𝕏</span>
            X (Twitter)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={shareLinks.email} className="cursor-pointer gap-3" onClick={() => onShareSuccess?.()}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500"><Send className="h-4 w-4 text-white" /></span>
            Email
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500">
            {copied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4 text-white" />}
          </span>
          {copied ? t('bookSummaries', 'copied', 'Copied!') : t('bookSummaries', 'copyLink', 'Copy Link')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const BookSummaries: React.FC = () => {
  // ✅ STEP 1: Call ALL hooks first (before any returns)
  const { t, getLocalizedContent } = useLanguage();
  const { user, profile } = useAuth();
  const entitlements = useUserEntitlements();
  
  // ✅ ALL useState hooks
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null);
  const [savedBooks, setSavedBooks] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [userReferralCode, setUserReferralCode] = useState<string>('');
  const [referralStats, setReferralStats] = useState<ReferralStats>({
    total_referrals: 0,
    total_clicks: 0,
    total_conversions: 0,
    books_shared: 0
  });
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [referralLeaderboard, setReferralLeaderboard] = useState<any[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  // ✅ ALL useRef hooks
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // ✅ STEP 2: Define functions that are used in useEffect BEFORE the useEffect hooks
  const loadBooks = async () => {
    try {
      const { data, error } = await supabase
        .from('book_summaries')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBooks(data || []);
    } catch (err) {
      console.error('Error loading books:', err);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedBooks = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('bookmarks')
        .select('content_id')
        .eq('content_type', 'book')
        .eq('user_id', user.id);
      
      if (data) {
        setSavedBooks(data.map(b => b.content_id));
      }
    } catch (err) {
      console.error('Error loading saved books:', err);
    }
  };

  const initializeReferralSystem = async () => {
    if (!user) return;
    
    try {
      // Check if user already has a referral code
      const { data: existingCode } = await supabase
        .from('user_profiles')
        .select('referral_code')
        .eq('id', user.id)
        .single();

      if (existingCode?.referral_code) {
        setUserReferralCode(existingCode.referral_code);
      } else {
        // Generate unique referral code
        const code = `BOOK${user.id.substring(0, 8).toUpperCase()}`;
        
        await supabase
          .from('user_profiles')
          .update({ referral_code: code })
          .eq('id', user.id);
        
        setUserReferralCode(code);
      }
    } catch (err) {
      console.error('Error initializing referral system:', err);
    }
  };

  const loadReferralStats = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('book_referrals')
        .select('*')
        .eq('referrer_id', user.id);

      if (error) throw error;

      if (data) {
        const stats: ReferralStats = {
          total_referrals: data.length,
          total_clicks: data.reduce((sum, r) => sum + (r.clicks || 0), 0),
          total_conversions: data.reduce((sum, r) => sum + (r.conversions || 0), 0),
          books_shared: new Set(data.map(r => r.book_id)).size
        };
        setReferralStats(stats);
      }

      // Load leaderboard
      const { data: leaderboardData } = await supabase
        .from('book_referrals')
        .select(`
          referrer_id,
          user_profiles!book_referrals_referrer_id_fkey(full_name, avatar_url)
        `);

      if (leaderboardData) {
        const aggregated = leaderboardData.reduce((acc: any, curr: any) => {
          const userId = curr.referrer_id;
          if (!acc[userId]) {
            acc[userId] = {
              user_id: userId,
              full_name: curr.user_profiles?.full_name || 'Anonymous',
              avatar_url: curr.user_profiles?.avatar_url,
              count: 0
            };
          }
          acc[userId].count++;
          return acc;
        }, {});

        const leaderboard = Object.values(aggregated)
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 10);

        setReferralLeaderboard(leaderboard);
      }
    } catch (err) {
      console.error('Error loading referral stats:', err);
    }
  };
  
  // ✅ STEP 3: NOW all useEffect hooks (can safely call the functions above)
  useEffect(() => {
    loadBooks();
    loadSavedBooks();
    if (user) {
      initializeReferralSystem();
      loadReferralStats();
    }
  }, [user]);

  // Open a book arriving from a shared link (/books/:id[?ref=code]) once books
  // have loaded, and credit the referrer if a ref code is present.
  const deepLinkBookRef = useRef(consumeDeepLink('books'));
  useEffect(() => {
    const dl = deepLinkBookRef.current;
    if (!dl?.id || books.length === 0) return;
    const book = books.find(b => b.id === dl.id);
    if (book) {
      setSelectedBook(book);
      if (dl.ref) trackReferralArrival(dl.id, dl.ref);
    }
    deepLinkBookRef.current = null; // open + track only once
  }, [books]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.playbackRate = playbackRate;
    }
  }, [volume, playbackRate]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [selectedBook]);

  // ✅ STEP 4: Compute derived values
  const canAccessBookSummaries = entitlements.canAccessBookSummaries;
  const { activePrompt, show: showUpgradePrompt, dismiss: dismissUpgradePrompt } = useUpgradePrompt();
  const categories = ['All', 'Spiritual Growth', 'Prayer', 'Faith', 'Leadership', 'Relationships', 'Biography'];

  // ✅ STEP 5: NOW it's safe to do conditional rendering
  if (entitlements.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // Block access if user doesn't have Premium subscription
  // Trigger upgrade prompt instead of blocking with full-screen gate
  const handleBookSummaryAccess = () => {
    if (!canAccessBookSummaries) {
      return false;
    }
    return true;
  };



  // ✅ STEP 6: Define remaining helper functions (ones NOT used in useEffect)
  const trackReferralClick = async (bookId: string) => {
    if (!user) return;

    try {
      // Get or create referral record
      const { data: existing } = await supabase
        .from('book_referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .eq('book_id', bookId)
        .single();

      if (existing) {
        await supabase
          .from('book_referrals')
          .update({ clicks: (existing.clicks || 0) + 1 })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('book_referrals')
          .insert({
            referrer_id: user.id,
            book_id: bookId,
            referral_code: userReferralCode,
            clicks: 1,
            conversions: 0
          });
      }

      loadReferralStats();
    } catch (err) {
      console.error('Error tracking referral click:', err);
    }
  };

  const trackReferralConversion = async (bookId: string, referredUserId: string) => {
    if (!user) return;

    try {
      const { data: referral } = await supabase
        .from('book_referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .eq('book_id', bookId)
        .single();

      if (referral) {
        await supabase
          .from('book_referrals')
          .update({ 
            conversions: (referral.conversions || 0) + 1,
            referred_user_id: referredUserId
          })
          .eq('id', referral.id);

        loadReferralStats();
      }
    } catch (err) {
      console.error('Error tracking referral conversion:', err);
    }
  };

  // Record a conversion when a user arrives via a shared referral link
  // (/books/:id?ref=<code>). The referral row is keyed by referral_code, not the
  // arriving user, so this credits the sharer.
  const trackReferralArrival = async (bookId: string, refCode: string) => {
    try {
      const { data: referral } = await supabase
        .from('book_referrals')
        .select('*')
        .eq('referral_code', refCode)
        .eq('book_id', bookId)
        .maybeSingle();

      if (referral) {
        // Don't credit the referrer for opening their own link.
        if (user?.id && referral.referrer_id === user.id) return;
        await supabase
          .from('book_referrals')
          .update({
            clicks: (referral.clicks || 0) + 1,
            conversions: (referral.conversions || 0) + 1,
            referred_user_id: user?.id || referral.referred_user_id || null,
          })
          .eq('id', referral.id);
      }
    } catch (err) {
      console.error('Error tracking referral arrival:', err);
    }
  };

  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         book.author?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || book.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleSave = async (bookId: string) => {
    if (!user) {
      toast({
        title: t('bookSummaries', 'signInRequired', 'Sign in required'),
        description: t('bookSummaries', 'signInToSave', 'Please sign in to save books')
      });
      return;
    }

    try {
      if (savedBooks.includes(bookId)) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('content_id', bookId)
          .eq('content_type', 'book')
          .eq('user_id', user.id);
        setSavedBooks(prev => prev.filter(id => id !== bookId));
        toast({ title: t('bookSummaries', 'removedFromLibrary', 'Removed from Library') });
      } else {
        await supabase.from('bookmarks').insert({
          user_id: user.id,
          content_id: bookId,
          content_type: 'book',
          created_at: new Date().toISOString()
        });
        setSavedBooks(prev => [...prev, bookId]);
        toast({ title: t('bookSummaries', 'savedToLibrary', 'Saved to Library') });
      }
    } catch (err) {
      console.error('Error toggling save:', err);
    }
  };

  // Audio player functions
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const skipForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 15, duration);
    }
  };

  const skipBackward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 15, 0);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleStartBook = async (book: BookSummary) => {
    if (!user || !profile) return;

    try {
      const { data: existingProgress } = await supabase
        .from('user_book_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('book_id', book.id)
        .single();

      if (!existingProgress) {
        await postBookStarted(
          user.id,
          profile.full_name || profile.email || 'Anonymous',
          profile.avatar_url,
          book.id,
          book.title,
          book.author
        );

        await supabase.from('user_book_progress').insert({
          user_id: user.id,
          book_id: book.id,
          started_at: new Date().toISOString(),
          is_completed: false
        });
      }
    } catch (error) {
      console.error('Error posting book start:', error);
    }
  };

  const handleCompleteBook = async (book: BookSummary) => {
    if (!user || !profile) return;

    try {
      // Keep a single progress row per (user, book): update the row created when
      // the book was started, otherwise insert one. This guarantees the
      // "Books Completed" stat counts each book exactly once.
      const completedAt = new Date().toISOString();
      const { data: existing } = await supabase
        .from('user_book_progress')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_id', book.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_book_progress')
          .update({ is_completed: true, completed_at: completedAt })
          .eq('id', existing.id);
      } else {
        await supabase.from('user_book_progress').insert({
          user_id: user.id,
          book_id: book.id,
          started_at: completedAt,
          completed_at: completedAt,
          is_completed: true
        });
      }

      // Refresh the app-shell analytics so "Books Completed" updates immediately.
      window.dispatchEvent(new Event('streak:updated'));

      await postBookCompleted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        book.id,
        book.title,
        book.author
      );

      toast({
        title: t('bookSummaries', 'bookCompleted', 'Book Completed! 📚'),
        description: t('bookSummaries', 'achievementShared', 'Your achievement has been shared with the community')
      });
    } catch (error) {
      console.error('Error posting book completion:', error);
    }
  };

  const openBook = async (book: BookSummary) => {
    if (!user || !profile) {
      toast({
        title: t('bookSummaries', 'signInRequired', 'Sign in required'),
        description: t('bookSummaries', 'signInToRead', 'Please sign in to read books')
      });
      return;
    }

    setSelectedBook(book);
    await handleStartBook(book);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const cyclePlaybackRate = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    setPlaybackRate(rates[nextIndex]);
  };

  // ✅ STEP 7: Another conditional return if needed
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <div className="h-48 bg-gray-200"></div>
              <CardContent className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-6 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ✅ STEP 8: Main render
  return (
    <div className="space-y-6">
      {/* Header with Referral Stats */}
      <div className="flex flex-col lg:flex-row gap-4 items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-600">{t('bookSummaries', 'headerTagline', 'Discover wisdom from great books, condensed for busy believers')}</p>
        </div>
        
        {user && (
          <div className="flex gap-2">
            <Button
              onClick={() => setShowReferralDialog(true)}
              variant="outline"
              className="hover:bg-purple-50 hover:border-purple-300"
            >
              <Award className="h-4 w-4 mr-2" />
              {t('bookSummaries', 'myReferrals', 'My Referrals')} ({referralStats.total_referrals})
            </Button>
          </div>
        )}
      </div>

      {/* Referral Quick Stats */}
      {user && referralStats.total_referrals > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-600 font-medium">{t('bookSummaries', 'totalShares', 'Total Shares')}</p>
                  <p className="text-2xl font-bold text-purple-900">{referralStats.total_referrals}</p>
                </div>
                <Gift className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">{t('bookSummaries', 'linkClicks', 'Link Clicks')}</p>
                  <p className="text-2xl font-bold text-blue-900">{referralStats.total_clicks}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 font-medium">{t('bookSummaries', 'booksRead', 'Books Read')}</p>
                  <p className="text-2xl font-bold text-green-900">{referralStats.total_conversions}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 font-medium">{t('bookSummaries', 'booksShared', 'Books Shared')}</p>
                  <p className="text-2xl font-bold text-amber-900">{referralStats.books_shared}</p>
                </div>
                <Zap className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      <SearchFilterPanel icon={<BookOpen className="h-6 w-6 text-white/60" />}>
        <div className="relative flex-1">
          <Search className={searchFilterIconClass} />
          <Input 
            placeholder={t('bookSummaries', 'searchBooks', 'Search books...')}
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            className={searchFilterInputClass}
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className={`w-full md:w-56 ${searchFilterSelectTriggerClass}`}>
            <SelectValue placeholder={t('bookSummaries', 'category', 'Category')} />
          </SelectTrigger>
          <SelectContent>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>
                {cat === 'All' ? t('bookSummaries', 'allCategories', 'All Categories') : cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SearchFilterPanel>

      {/* Books Grid */}
      {filteredBooks.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">{t('bookSummaries', 'noBooksFound', 'No Books Found')}</h3>
          <p className="text-gray-500">
            {searchQuery
              ? t('bookSummaries', 'tryDifferentSearch', 'Try a different search term')
              : t('bookSummaries', 'booksWillAppear', 'Book summaries will appear here once added by admin')}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredBooks.map(book => {
            const lz = getLocalizedContent(book, ['title', 'author']);
            return (
            <Card key={book.id} className="overflow-hidden hover:shadow-xl transition-all group">
              <div
                className="h-48 bg-gradient-to-br from-purple-700 to-blue-800 relative flex items-center justify-center cursor-pointer"
                onClick={() => openBook(book)}
              >
                {book.cover_image_url ? (
                  <img src={book.cover_image_url} alt={lz.title} className="w-full h-full object-cover" />
                ) : (
                  <BookOpen className="h-16 w-16 text-white/30" />
                )}
                <div className="absolute top-2 right-2 flex gap-2">
                  {book.audio_url && (
                    <div className="h-8 w-8 bg-white/20 rounded-full flex items-center justify-center">
                      <Headphones className="h-4 w-4 text-white" />
                    </div>
                  )}
                  {book.pdf_url && (
                    <div className="h-8 w-8 bg-white/20 rounded-full flex items-center justify-center">
                      <FileText className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 bg-white/20 hover:bg-white/40" 
                    onClick={e => { 
                      e.stopPropagation(); 
                      toggleSave(book.id); 
                    }}
                  >
                    <Bookmark className={`h-4 w-4 ${savedBooks.includes(book.id) ? 'fill-white text-white' : 'text-white'}`} />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <Badge variant="secondary" className="mb-2 text-xs">{book.category}</Badge>
                <h3 
                  className="font-bold text-lg mb-1 group-hover:text-purple-600 transition-colors line-clamp-2 cursor-pointer"
                  onClick={() => openBook(book)}
                >
                  {lz.title}
                </h3>
                <p className="text-sm text-gray-500 mb-3">{lz.author}</p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    <span>{t('bookSummaries', 'readTime', '~15 min')}</span>
                  </div>
                  
                  {user && (
                    <ShareBookButton 
                      book={book} 
                      referralCode={userReferralCode}
                      onShareSuccess={() => trackReferralClick(book.id)}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Book Detail Dialog */}
      <Dialog open={!!selectedBook} onOpenChange={() => { setSelectedBook(null); setIsPlaying(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedBook && (() => {
            const lz = getLocalizedContent(selectedBook, ['title', 'author', 'summary', 'key_takeaways']);
            return (
            <>
              {selectedBook.audio_url && (
                <audio
                  ref={audioRef}
                  src={selectedBook.audio_url}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />
              )}
              <DialogHeader>
                <Badge className="w-fit mb-2">{selectedBook.category}</Badge>
                <DialogTitle className="text-2xl">{lz.title}</DialogTitle>
                <p className="text-gray-500">{t('bookSummaries', 'byAuthor', 'by')} {lz.author}</p>
              </DialogHeader>
              <div className="space-y-6">
                {selectedBook.cover_image_url && (
                  <img src={selectedBook.cover_image_url} alt={lz.title} className="w-full h-48 object-cover rounded-lg" />
                )}

                {/* Audio Section - Prioritize existing audio, fallback to TTS */}
                <div>
                  {selectedBook.audio_url ? (
                    // Existing pre-recorded audio
                    <>
                      <audio
                        ref={audioRef}
                        src={selectedBook.audio_url}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={() => setIsPlaying(false)}
                      />
                      <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Headphones className="h-5 w-5 text-purple-600" />
                            <span className="font-semibold text-purple-800">{t('bookSummaries', 'professionalAudio', 'Professional Audio Recording')}</span>
                          </div>
                          
                          <div className="space-y-2 mb-4">
                            <Slider
                              value={[currentTime]}
                              max={duration || 100}
                              step={1}
                              onValueChange={handleSeek}
                              className="cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>{formatTime(currentTime)}</span>
                              <span>{formatTime(duration)}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={cyclePlaybackRate}
                                className="text-xs font-medium"
                              >
                                {playbackRate}x
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" onClick={skipBackward}>
                                <SkipBack className="h-5 w-5" />
                              </Button>
                              <Button
                                onClick={togglePlay}
                                size="icon"
                                className="h-12 w-12 rounded-full bg-purple-600 hover:bg-purple-700"
                              >
                                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                              </Button>
                              <Button variant="ghost" size="icon" onClick={skipForward}>
                                <SkipForward className="h-5 w-5" />
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" onClick={toggleMute}>
                                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                              </Button>
                              <Slider
                                value={[isMuted ? 0 : volume]}
                                max={100}
                                step={1}
                                onValueChange={(v) => setVolume(v[0])}
                                className="w-20"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    // Generate high-quality TTS audio
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Volume2 className="h-4 w-4" />
                        <span className="font-medium">{t('bookSummaries', 'listenToSummary', 'Listen to Summary')}</span>
                      </div>
                      <HighQualityAudioPlayer
                        text={`${lz.title} by ${lz.author}\n\nBook Summary:\n\n${stripMarkdown(lz.summary)}\n\nKey Takeaways:\n${lz.key_takeaways?.map((takeaway, i) => `${i + 1}. ${takeaway}`).join('\n') || ''}`}
                        contentId={selectedBook.id}
                        contentType="book"
                        title={t('bookSummaries', 'listenToBookSummary', 'Listen to Book Summary')}
                        autoLoad={false}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold mb-2">{t('bookSummaries', 'summary', 'Summary')}</h4>
                  <div
                    className="prose prose-sm max-w-none text-gray-700
                      prose-p:my-3 prose-p:leading-relaxed
                      prose-headings:text-gray-900 prose-headings:font-bold prose-headings:mt-5 prose-headings:mb-2
                      prose-h1:text-lg prose-h2:text-base prose-h3:text-base
                      prose-ul:my-3 prose-li:my-1 prose-strong:text-gray-900"
                    dangerouslySetInnerHTML={{ __html: renderSummaryHtml(lz.summary) }}
                  />
                </div>

                {lz.key_takeaways && lz.key_takeaways.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">{t('bookSummaries', 'keyTakeaways', 'Key Takeaways')}</h4>
                    <ul className="space-y-2">
                      {lz.key_takeaways.map((takeaway, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-purple-600 mt-1 flex-shrink-0" />
                          <span>{takeaway}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedBook.pdf_url && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => window.open(selectedBook.pdf_url, '_blank')}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {t('bookSummaries', 'downloadPdf', 'Download PDF')}
                  </Button>
                )}

                {/* Share this book */}
                {user && (
                  <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-purple-900 mb-1">{t('bookSummaries', 'shareThisBook', 'Share this book')}</h4>
                          <p className="text-sm text-purple-700">{t('bookSummaries', 'helpOthersDiscover', 'Help others discover this wisdom')}</p>
                        </div>
                        <ShareBookButton 
                          book={selectedBook} 
                          referralCode={userReferralCode}
                          onShareSuccess={() => trackReferralClick(selectedBook.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <DialogFooter className="flex gap-2 mt-4">
                <Button
                  onClick={async () => {
                    if (selectedBook) {
                      await handleCompleteBook(selectedBook);
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('bookSummaries', 'markAsComplete', 'Mark as Complete')}
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => toggleSave(selectedBook.id)}
                >
                  <Bookmark className="h-4 w-4 mr-2" />
                  {savedBooks.includes(selectedBook.id) ? t('bookSummaries', 'removeFromLibrary', 'Remove from Library') : t('bookSummaries', 'saveToLibrary', 'Save to Library')}
                </Button>
              </DialogFooter>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Referral Dashboard Dialog */}
      <Dialog open={showReferralDialog} onOpenChange={setShowReferralDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-6 w-6 text-purple-600" />
              {t('bookSummaries', 'myReferralDashboard', 'My Referral Dashboard')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-purple-900">{referralStats.total_referrals}</p>
                  <p className="text-xs text-purple-600 mt-1">{t('bookSummaries', 'totalShares', 'Total Shares')}</p>
                </CardContent>
              </Card>

              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-blue-900">{referralStats.total_clicks}</p>
                  <p className="text-xs text-blue-600 mt-1">{t('bookSummaries', 'linkClicks', 'Link Clicks')}</p>
                </CardContent>
              </Card>

              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-900">{referralStats.total_conversions}</p>
                  <p className="text-xs text-green-600 mt-1">{t('bookSummaries', 'booksRead', 'Books Read')}</p>
                </CardContent>
              </Card>

              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-amber-900">{referralStats.books_shared}</p>
                  <p className="text-xs text-amber-600 mt-1">{t('bookSummaries', 'booksShared', 'Books Shared')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Your Referral Code */}
            <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Gift className="h-5 w-5 text-purple-600" />
                  {t('bookSummaries', 'yourReferralCode', 'Your Referral Code')}
                </h4>
                <div className="flex gap-2">
                  <Input 
                    value={userReferralCode} 
                    readOnly 
                    className="font-mono bg-white"
                  />
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(userReferralCode);
                      toast({ title: t('bookSummaries', 'copied', 'Copied!'), description: t('bookSummaries', 'referralCodeCopied', 'Referral code copied to clipboard') });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {t('bookSummaries', 'shareCodeHint', 'Share books with this code to track your referrals and inspire others to read')}
                </p>
              </CardContent>
            </Card>

            {/* Leaderboard */}
            {referralLeaderboard.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" />
                    {t('bookSummaries', 'topSharers', 'Top Sharers')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {referralLeaderboard.map((leader, index) => (
                      <div 
                        key={leader.user_id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          leader.user_id === user?.id ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-amber-500 text-white' :
                            index === 1 ? 'bg-gray-400 text-white' :
                            index === 2 ? 'bg-amber-700 text-white' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {index + 1}
                          </div>
                          {leader.avatar_url ? (
                            <img 
                              src={leader.avatar_url} 
                              alt={leader.full_name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center">
                              <Users className="h-5 w-5 text-purple-600" />
                            </div>
                          )}
                          <span className="font-medium">{leader.full_name}</span>
                          {leader.user_id === user?.id && (
                            <Badge variant="secondary" className="text-xs">{t('bookSummaries', 'you', 'You')}</Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-purple-900">{leader.count}</p>
                          <p className="text-xs text-gray-500">{t('bookSummaries', 'sharesLabel', 'shares')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
