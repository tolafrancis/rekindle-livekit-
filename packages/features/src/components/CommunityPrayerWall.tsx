import { useState, useEffect, useRef } from 'react';
import { Card } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { useLanguage } from '../LanguageContext';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { Heart, MessageCircle, Plus, CheckCircle, User, AlertCircle, Lock, Crown, Loader2 } from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';

interface PrayerPost {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  content: string;
  category: string;
  is_anonymous: boolean;
  is_answered: boolean;
  is_hidden: boolean;
  is_featured: boolean;
  prayer_count: number;
  created_at: string;
}

// Posts are fetched a page at a time instead of the whole wall.
const PAGE_SIZE = 20;

export function CommunityPrayerWall() {
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();

  const [posts, setPosts] = useState<PrayerPost[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [filter, setFilter] = useState('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // Latest values for the realtime handler, which is registered once.
  const postsCountRef = useRef(0);
  const filterRef = useRef(filter);
  postsCountRef.current = posts.length;
  filterRef.current = filter;
  
  // Check prayer wall access level
  const prayerWallAccessLevel = 'unlimited'; // Prayer wall is free for all users
  const canPostPrayers = prayerWallAccessLevel !== 'view_only';

  useEffect(() => {
    loadCurrentUser();

    // Set up realtime subscription. Every "pray" tap anywhere updates a row's
    // prayer_count, so changes are coalesced into one quiet refresh of the
    // posts already on screen every 2s, instead of a full reload per change.
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('prayer-wall')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'prayer_wall_posts' 
      }, () => {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          fetchPostsRef.current({ silent: true });
        }, 2000);
      })
      .subscribe();
    
    return () => { 
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel); 
    };
  }, []);

  // First page, and back to the first page whenever the category changes
  // (the category is filtered in the query now, not over an in-memory list).
  useEffect(() => {
    fetchPosts({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadCurrentUser = async () => {
    try {
      // Local session read — no auth-server round trip needed just for the id.
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      setCurrentUserId(session?.user?.id || null);
    } catch (err) {
      console.error('Error loading current user:', err);
    }
  };

  // reset: first page only. append: next page. Otherwise (after a post, pray,
  // or realtime change) re-fetch the window already on screen so the list
  // doesn't collapse back to page one. silent: don't toggle the loading state.
  const fetchPosts = async (opts: { reset?: boolean; append?: boolean; silent?: boolean } = {}) => {
    const loaded = postsCountRef.current;
    const from = opts.append ? loaded : 0;
    const to = opts.append || opts.reset
      ? from + PAGE_SIZE - 1
      : Math.max(PAGE_SIZE, loaded) - 1;
    try {
      if (opts.append) setLoadingMore(true);
      else if (!opts.silent) setLoading(true);
      let query = supabase
        .from('prayer_wall_posts')
        .select('*')
        .eq('is_hidden', false);  // Only show non-hidden posts
      if (filterRef.current !== 'all') query = query.eq('category', filterRef.current);
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      
      const rows = data || [];
      if (opts.append) {
        setPosts(prev => {
          const seen = new Set(prev.map(p => p.id));
          return [...prev, ...rows.filter(p => !seen.has(p.id))];
        });
      } else {
        setPosts(rows);
      }
      setHasMore(rows.length === to - from + 1);
    } catch (err: any) {
      console.error('Error fetching posts:', err);
      if (!opts.silent) {
        toast({
          title: t('communityPrayerWall', 'error', 'Error'),
          description: t('communityPrayerWall', 'failedToLoadRequests', 'Failed to load prayer requests'),
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  const fetchPostsRef = useRef(fetchPosts);
  fetchPostsRef.current = fetchPosts;

  const submitPost = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: t('communityPrayerWall', 'validationError', 'Validation Error'),
        description: t('communityPrayerWall', 'enterTitleAndContent', 'Please enter both title and content'),
        variant: 'destructive'
      });
      return;
    }
    
    // Check if user can post prayers
    if (!canPostPrayers) {
      toast({
        title: t('communityPrayerWall', 'error', 'Error'),
        description: t('communityPrayerWall', 'couldNotPostRequest', 'Could not post prayer request. Please try again.'),
        variant: 'destructive'
      });
      return;
    }
    
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (!user) {
        toast({
          title: t('communityPrayerWall', 'authRequired', 'Authentication Required'),
          description: t('communityPrayerWall', 'mustLoginToPost', 'You must be logged in to post a prayer request'),
          variant: 'destructive'
        });
        return;
      }
      
      // Get user profile for name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      
      // Insert prayer post
      const { error: insertError } = await supabase
        .from('prayer_wall_posts')
        .insert({
          user_id: user.id,
          user_name: isAnonymous ? 'Anonymous' : (profile?.full_name || 'User'),
          title: title.trim(), 
          content: content.trim(), 
          category, 
          is_anonymous: isAnonymous,
          is_answered: false,
          is_featured: false,
          is_hidden: false,
          prayer_count: 0
        });
      
      if (insertError) throw insertError;
      
      toast({
        title: t('communityPrayerWall', 'success', 'Success'),
        description: t('communityPrayerWall', 'requestPosted', 'Your prayer request has been posted')
      });
      
      // Reset form
      setTitle(''); 
      setContent(''); 
      setCategory('general');
      setIsAnonymous(false);
      setShowForm(false);
      
      // Refresh posts
      fetchPosts();
    } catch (err: any) {
      console.error('Error submitting post:', err);
      toast({
        title: t('communityPrayerWall', 'error', 'Error'),
        description: err.message || t('communityPrayerWall', 'failedToPostRequest', 'Failed to post prayer request'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const prayForPost = async (post: PrayerPost) => {
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (!user) {
        toast({
          title: t('communityPrayerWall', 'authRequired', 'Authentication Required'),
          description: t('communityPrayerWall', 'mustLoginToPray', 'You must be logged in to pray for this request'),
          variant: 'destructive'
        });
        return;
      }
      
      // Check if user already prayed for this post
      const { data: existingResponse } = await supabase
        .from('prayer_wall_responses')
        .select('id')
        .eq('post_id', post.id)
        .eq('user_id', user.id)
        .single();
      
      if (existingResponse) {
        toast({
          title: t('communityPrayerWall', 'alreadyPraying', 'Already Praying'),
          description: t('communityPrayerWall', 'alreadyPrayingDesc', 'You are already praying for this request'),
        });
        return;
      }
      
      // Get user profile for name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      
      // Update prayer count
      const { error: updateError } = await supabase
        .from('prayer_wall_posts')
        .update({ prayer_count: post.prayer_count + 1 })
        .eq('id', post.id);
      
      if (updateError) throw updateError;
      
      // Insert response
      const { error: insertError } = await supabase
        .from('prayer_wall_responses')
        .insert({ 
          post_id: post.id, 
          user_id: user.id, 
          user_name: profile?.full_name || 'Anonymous'
        });
      
      if (insertError) throw insertError;
      
      toast({
        title: t('communityPrayerWall', 'praying', 'Praying'),
        description: t('communityPrayerWall', 'nowPrayingDesc', 'You are now praying for this request')
      });
      
      fetchPosts();
    } catch (err: any) {
      console.error('Error praying for post:', err);
      toast({
        title: t('communityPrayerWall', 'error', 'Error'),
        description: err.message || t('communityPrayerWall', 'failedToPray', 'Failed to pray for this request'),
        variant: 'destructive'
      });
    }
  };

  const markAnswered = async (postId: string) => {
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (!user) return;
      
      const { error } = await supabase
        .from('prayer_wall_posts')
        .update({ is_answered: true })
        .eq('id', postId)
        .eq('user_id', user.id); // Only allow user to mark their own posts
      
      if (error) throw error;
      
      toast({
        title: t('communityPrayerWall', 'answered', 'Answered'),
        description: t('communityPrayerWall', 'markedAsAnswered', 'Prayer request marked as answered')
      });
      
      fetchPosts();
    } catch (err: any) {
      console.error('Error marking post as answered:', err);
      toast({
        title: t('communityPrayerWall', 'error', 'Error'),
        description: err.message || t('communityPrayerWall', 'failedToMarkAnswered', 'Failed to mark as answered'),
        variant: 'destructive'
      });
    }
  };

  const categories = ['all', 'healing', 'family', 'guidance', 'gratitude', 'general'];
  const filtered = posts; // category is applied in the query

  const categoryColors: Record<string, string> = {
    healing: 'bg-green-100 text-green-700',
    family: 'bg-pink-100 text-pink-700',
    guidance: 'bg-blue-100 text-blue-700',
    gratitude: 'bg-amber-100 text-amber-700',
    general: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button
              disabled={!canPostPrayers}
              onClick={() => {
                if (!canPostPrayers) {
                  toast({
                    title: t('communityPrayerWall', 'error', 'Error'),
                    description: t('communityPrayerWall', 'couldNotPostRequest', 'Could not post prayer request. Please try again.'),
                    variant: 'destructive'
                  });
                }
              }}
            >
              {!canPostPrayers && <Lock className="h-4 w-4 mr-2" />}
              <Plus className="h-4 w-4 mr-2" />
              {t('communityPrayerWall', 'shareRequest', 'Share Request')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('communityPrayerWall', 'sharePrayerRequest', 'Share Prayer Request')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Input
                  placeholder={t('communityPrayerWall', 'prayerTitlePlaceholder', 'Prayer title')}
                  value={title} 
                  onChange={e => setTitle(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <Textarea
                  placeholder={t('communityPrayerWall', 'shareRequestPlaceholder', 'Share your prayer request...')}
                  value={content} 
                  onChange={e => setContent(e.target.value)} 
                  rows={4}
                  disabled={loading}
                />
              </div>
              <div>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value)} 
                  className="w-full p-2 border rounded"
                  disabled={loading}
                >
                  <option value="general">{t('communityPrayerWall', 'catGeneral', 'General')}</option>
                  <option value="healing">{t('communityPrayerWall', 'catHealing', 'Healing')}</option>
                  <option value="family">{t('communityPrayerWall', 'catFamily', 'Family')}</option>
                  <option value="guidance">{t('communityPrayerWall', 'catGuidance', 'Guidance')}</option>
                  <option value="gratitude">{t('communityPrayerWall', 'catGratitude', 'Gratitude')}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="checkbox" 
                  checked={isAnonymous} 
                  onChange={e => setIsAnonymous(e.target.checked)}
                  disabled={loading}
                />
                {t('communityPrayerWall', 'postAnonymously', 'Post anonymously')}
              </label>
              <Button 
                onClick={submitPost} 
                className="w-full"
                disabled={loading || !title.trim() || !content.trim()}
              >
                {loading ? t('communityPrayerWall', 'posting', 'Posting...') : t('communityPrayerWall', 'submitPrayerRequest', 'Submit Prayer Request')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <Button 
            key={c} 
            size="sm" 
            variant={filter === c ? 'default' : 'outline'} 
            onClick={() => setFilter(c)} 
            className="capitalize"
          >
            {c === 'all' ? t('communityPrayerWall', 'catAll', 'all')
              : c === 'healing' ? t('communityPrayerWall', 'catHealing', 'Healing')
              : c === 'family' ? t('communityPrayerWall', 'catFamily', 'Family')
              : c === 'guidance' ? t('communityPrayerWall', 'catGuidance', 'Guidance')
              : c === 'gratitude' ? t('communityPrayerWall', 'catGratitude', 'Gratitude')
              : c === 'general' ? t('communityPrayerWall', 'catGeneral', 'General')
              : c}
          </Button>
        ))}
      </div>

      {loading && posts.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">{t('communityPrayerWall', 'loadingRequests', 'Loading prayer requests...')}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">
            {filter === 'all'
              ? t('communityPrayerWall', 'noRequestsYet', 'No prayer requests yet. Be the first to share!')
              : t('communityPrayerWall', 'noRequestsInCategory', 'No prayer requests in this category')}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map(post => (
            <Card key={post.id} className={`p-4 ${post.is_answered ? 'border-green-300 bg-green-50' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{post.user_name}</p>
                    <p className="text-xs text-gray-500">{new Date(post.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${categoryColors[post.category]}`}>
                  {post.category === 'healing' ? t('communityPrayerWall', 'catHealing', 'Healing')
                    : post.category === 'family' ? t('communityPrayerWall', 'catFamily', 'Family')
                    : post.category === 'guidance' ? t('communityPrayerWall', 'catGuidance', 'Guidance')
                    : post.category === 'gratitude' ? t('communityPrayerWall', 'catGratitude', 'Gratitude')
                    : post.category === 'general' ? t('communityPrayerWall', 'catGeneral', 'General')
                    : post.category}
                </span>
              </div>
              <h3 className="font-bold mb-1">{post.title}</h3>
              <p className="text-sm text-gray-600 mb-3">{post.content}</p>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => prayForPost(post)}
                  disabled={loading}
                >
                  <Heart className="h-4 w-4 mr-1 text-red-500" />
                  {t('communityPrayerWall', 'countPraying', '{count} Praying').replace('{count}', String(post.prayer_count))}
                </Button>
                {currentUserId === post.user_id && !post.is_answered && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => markAnswered(post.id)}
                    disabled={loading}
                  >
                    <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                    {t('communityPrayerWall', 'markAnswered', 'Mark Answered')}
                  </Button>
                )}
                {post.is_answered && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {t('communityPrayerWall', 'answeredStatus', 'Answered!')}
                  </span>
                )}
              </div>
            </Card>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => fetchPosts({ append: true })} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('common', 'loadMore', 'Load more')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}