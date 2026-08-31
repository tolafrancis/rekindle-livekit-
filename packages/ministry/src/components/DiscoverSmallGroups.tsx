import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Badge } from '@rekindle/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Users, MapPin, Clock, Search, Loader2, Video } from 'lucide-react';
import {
  SearchFilterPanel, searchFilterInputClass, searchFilterSelectTriggerClass,
} from '@rekindle/features/components/SearchFilterPanel';
import { SmallGroupPage } from './SmallGroupPage';

interface DiscoverSmallGroupsProps {
  ministryId: string;
}

const CATEGORY_OPTIONS = [
  'Bible Study', 'Prayer Group', 'Youth', 'Men', 'Women', 'Couples',
  'Discipleship', 'Outreach', 'Worship', 'Other',
];

export const DiscoverSmallGroups: React.FC<DiscoverSmallGroupsProps> = ({ ministryId }) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [groups, setGroups] = useState<any[]>([]);
  const [myMemberships, setMyMemberships] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, [ministryId]);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('small_groups')
        .select('*')
        .eq('ministry_id', ministryId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      setGroups(data || []);

      if (user?.id) {
        const { data: mine } = await supabase
          .from('small_group_members')
          .select('group_id, status, role')
          .eq('user_id', user.id)
          .in('group_id', (data || []).map((g: any) => g.id));
        const map: Record<string, any> = {};
        (mine || []).forEach((m: any) => { map[m.group_id] = m; });
        setMyMemberships(map);
      }
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => groups.filter((g) => {
    // invite_only groups are never RLS-visible to non-members, but guard anyway.
    if (g.privacy === 'invite_only' && !myMemberships[g.id]) return false;
    const matchesSearch = !searchTerm ||
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || g.category === categoryFilter;
    const matchesDay = dayFilter === 'all' || g.meeting_day === dayFilter;
    const matchesLocation = locationFilter === 'all' || g.location_type === locationFilter;
    return matchesSearch && matchesCategory && matchesDay && matchesLocation;
  }), [groups, myMemberships, searchTerm, categoryFilter, dayFilter, locationFilter]);

  const handleJoin = async (g: any) => {
    if (!user?.id) return;
    setJoiningId(g.id);
    try {
      const isPublic = g.privacy === 'public';
      const { error } = await supabase.from('small_group_members').insert({
        group_id: g.id,
        user_id: user.id,
        role: 'member',
        status: isPublic ? 'active' : 'pending',
        ...(isPublic ? { approved_at: new Date().toISOString(), joined_at: new Date().toISOString() } : {}),
      });
      if (error) throw error;
      toast({
        title: isPublic ? t('smallGroupsMember', 'joined', 'Joined!') : t('smallGroupsMember', 'requestSent', 'Request sent'),
        description: isPublic
          ? t('smallGroupsMember', 'joinedDesc', 'You\'re now a member of {name}.').replace('{name}', g.name)
          : t('smallGroupsMember', 'requestSentDesc', 'Your request to join {name} is awaiting approval.').replace('{name}', g.name),
      });
      await loadGroups();
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setJoiningId(null);
    }
  };

  if (selectedGroupId) {
    return <SmallGroupPage groupId={selectedGroupId} onBack={() => { setSelectedGroupId(null); loadGroups(); }} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" />{t('smallGroupsMember', 'discoverTitle', 'Discover Small Groups')}</h2>
        <p className="text-sm text-muted-foreground">{t('smallGroupsMember', 'discoverSubtitle', 'Find a group to grow with')}</p>
      </div>

      <SearchFilterPanel icon={<Search className="h-6 w-6 text-white/60" />}>
        <Input
          placeholder={t('smallGroupsMember', 'searchPlaceholder', 'Search groups...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={searchFilterInputClass}
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={`w-full md:w-44 ${searchFilterSelectTriggerClass}`}><SelectValue placeholder={t('smallGroupsMember', 'category', 'Category')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('smallGroupsMember', 'allCategories', 'All Categories')}</SelectItem>
            {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger className={`w-full md:w-40 ${searchFilterSelectTriggerClass}`}><SelectValue placeholder={t('smallGroupsMember', 'meetingDay', 'Meeting Day')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('smallGroupsMember', 'anyDay', 'Any Day')}</SelectItem>
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (
              <SelectItem key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className={`w-full md:w-36 ${searchFilterSelectTriggerClass}`}><SelectValue placeholder={t('smallGroupsMember', 'location', 'Location')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('smallGroupsMember', 'anyLocation', 'Any')}</SelectItem>
            <SelectItem value="physical">{t('smallGroupsMember', 'locationPhysical', 'In-Person')}</SelectItem>
            <SelectItem value="online">{t('smallGroupsMember', 'locationOnline', 'Online')}</SelectItem>
            <SelectItem value="hybrid">{t('smallGroupsMember', 'locationHybrid', 'Hybrid')}</SelectItem>
          </SelectContent>
        </Select>
      </SearchFilterPanel>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">{t('smallGroupsMember', 'noGroupsFound', 'No small groups match your search.')}</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((g) => {
            const mine = myMemberships[g.id];
            return (
              <Card key={g.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedGroupId(g.id)}>
                {g.cover_image_url && <img src={g.cover_image_url} alt="" className="w-full h-32 object-cover rounded-t-lg" />}
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{g.name}</h3>
                    {g.category && <Badge variant="outline">{g.category}</Badge>}
                  </div>
                  {g.description && <p className="text-sm text-muted-foreground line-clamp-2">{g.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {g.meeting_day && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{g.meeting_day}{g.meeting_time ? ` · ${g.meeting_time}` : ''}</span>}
                    {g.location_type === 'physical' && g.location_address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{g.location_address}</span>}
                    {g.location_type !== 'physical' && <span className="flex items-center gap-1"><Video className="h-3 w-3" />{t('smallGroupsMember', 'locationOnline', 'Online')}</span>}
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{g.member_count}{g.max_members ? `/${g.max_members}` : ''}</span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    {mine?.status === 'active' ? (
                      <Badge>{t('smallGroupsMember', 'youreAMember', "You're a member")}</Badge>
                    ) : mine?.status === 'pending' ? (
                      <Badge variant="secondary">{t('smallGroupsMember', 'requestPending', 'Request pending')}</Badge>
                    ) : g.max_members && g.member_count >= g.max_members ? (
                      <Badge variant="outline">{t('smallGroupsMember', 'groupFull', 'Group full')}</Badge>
                    ) : (
                      <Button size="sm" onClick={() => handleJoin(g)} disabled={joiningId === g.id}>
                        {joiningId === g.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        {g.privacy === 'public' ? t('smallGroupsMember', 'join', 'Join') : t('smallGroupsMember', 'requestToJoin', 'Request to Join')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DiscoverSmallGroups;
