import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { LiveChannel } from '@rekindle/types/liveChannelTypes';
import { LiveChannelViewer } from './LiveChannelViewer';
import { Loader2, Radio } from 'lucide-react';
import { Button } from '@rekindle/ui/button';

/**
 * Public channel-watch page for shared `/channels/:id` links.
 *
 * The channel Share button builds `${origin}/channels/:id`; this is the route
 * that resolves it. It is deliberately mountable OUTSIDE any auth gate so a
 * non-registered guest can open the link and watch a live broadcast without
 * signing in — LiveChannelViewer already supports an anonymous viewer (guest
 * presence id, viewer-only join) and the channel/broadcast rows are readable by
 * the anon role. Registered users opening the same link watch as themselves.
 */
export const ChannelWatchPage: React.FC<{ context?: 'main' | 'ministry' }> = ({ context = 'main' }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [channel, setChannel] = useState<LiveChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) { setNotFound(true); setLoading(false); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from('live_channels')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setChannel(data as LiveChannel);
        // Follow state only matters for authenticated users.
        if (user?.id) {
          const { data: f } = await supabase
            .from('channel_followers')
            .select('id')
            .eq('channel_id', id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (active) setIsFollowing(!!f);
        }
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id, user?.id]);

  const toggleFollow = async () => {
    if (!user?.id || !channel) return; // guests can't follow
    if (isFollowing) {
      await supabase.from('channel_followers').delete()
        .eq('channel_id', channel.id).eq('user_id', user.id);
      setIsFollowing(false);
    } else {
      await supabase.from('channel_followers').insert({
        channel_id: channel.id, user_id: user.id,
      });
      setIsFollowing(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        {t('liveChannelViewer', 'loading', 'Loading…')}
      </div>
    );
  }

  if (notFound || !channel) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 to-purple-900 text-white p-6 text-center">
        <Radio className="h-10 w-10 opacity-70" />
        <div>
          <h1 className="text-xl font-semibold">{t('liveChannelViewer', 'channelNotFoundTitle', 'Channel not found')}</h1>
          <p className="text-sm text-white/70 mt-1">
            {t('liveChannelViewer', 'channelNotFoundDesc', 'This channel link is invalid or the channel is no longer available.')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/')}>
          {t('liveChannelViewer', 'goHome', 'Go to Home')}
        </Button>
      </div>
    );
  }

  return (
    <LiveChannelViewer
      channel={channel}
      onLeave={() => navigate('/')}
      isFollowing={isFollowing}
      onToggleFollow={user?.id ? toggleFollow : undefined}
      context={context}
    />
  );
};

export default ChannelWatchPage;
