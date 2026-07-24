import React, { useState, useEffect } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Search, Edit, Trash2, Eye, EyeOff,
  BookOpen, Heart, MessageSquare, RefreshCw, Loader2, Sparkles, Star
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Revelation {
  id: string;
  user_id: string;
  title: string;
  content: string;
  scripture_reference?: string;
  category: string;
  is_featured: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_name?: string;
}

interface Testimony {
  id: string;
  user_id: string;
  author: string;
  title: string;
  content: string;
  category: string;
  likes: number;
  comments: any[];
  is_published: boolean;
  is_hidden: boolean;
  is_featured: boolean;
  created_at: string;
}

interface CommunityRevelationsManagerProps {
  onUpdate?: () => void;
}

const TESTIMONY_CATEGORIES = [
  'Healing', 'Provision', 'Restoration', 'Salvation',
  'Deliverance', 'Answered Prayer', 'Breakthrough', 'Protection', 'Other',
];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const CommunityRevelationsManager: React.FC<CommunityRevelationsManagerProps> = ({ onUpdate }) => {

  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useViewHistory<'revelations' | 'testimonies'>("community-revelations-manager", 'revelations');

  // ── Revelations state ──
  const [revelations, setRevelations] = useState<Revelation[]>([]);
  const [revLoading, setRevLoading] = useState(true);
  const [revSearch, setRevSearch] = useState('');
  const [revFilter, setRevFilter] = useState<'all' | 'visible' | 'hidden' | 'featured'>('all');
  const [showRevModal, setShowRevModal] = useState(false);
  const [editingRev, setEditingRev] = useState<Revelation | null>(null);
  const [revSaving, setRevSaving] = useState(false);
  const [revForm, setRevForm] = useState({
    title: '', content: '', scripture_reference: '',
    category: 'testimony', is_featured: false,
  });

  // ── Testimonies state ──
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [testLoading, setTestLoading] = useState(true);
  const [testSearch, setTestSearch] = useState('');
  const [testFilter, setTestFilter] = useState<'all' | 'visible' | 'hidden' | 'featured'>('all');
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingTest, setEditingTest] = useState<Testimony | null>(null);
  const [testSaving, setTestSaving] = useState(false);
  const [testForm, setTestForm] = useState({
    title: '', content: '', category: 'Other',
    is_published: true, is_hidden: false, is_featured: false,
  });

  useEffect(() => { loadRevelations(); loadTestimonies(); }, []);

  // ─────────────────────────────────────────────
  // Revelations data
  // ─────────────────────────────────────────────

  const loadRevelations = async () => {
    setRevLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_revelations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setRevelations(data || []);
    } catch (err: any) {
      console.error('Error loading revelations:', err);
      setRevelations([]);
    } finally {
      setRevLoading(false);
    }
  };

  const handleRevHide = async (id: string, hidden: boolean) => {
    try {
      const { error } = await supabase.from('community_revelations').update({ is_hidden: hidden }).eq('id', id);
      if (error) throw error;
      setRevelations(prev => prev.map(r => r.id === id ? { ...r, is_hidden: hidden } : r));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: hidden ? t('communityRevelationsManager', 'revelationHidden', 'Revelation hidden') : t('communityRevelationsManager', 'revelationVisible', 'Revelation visible') });
    } catch (err: any) {
      toast({ title: t('communityRevelationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleRevFeature = async (id: string, featured: boolean) => {
    try {
      const { error } = await supabase.from('community_revelations').update({ is_featured: featured }).eq('id', id);
      if (error) throw error;
      setRevelations(prev => prev.map(r => r.id === id ? { ...r, is_featured: featured } : r));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: featured ? t('communityRevelationsManager', 'revelationFeatured', 'Revelation featured') : t('communityRevelationsManager', 'revelationUnfeatured', 'Revelation unfeatured') });
    } catch (err: any) {
      toast({ title: t('communityRevelationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleRevDelete = async (id: string) => {
    if (!confirm(t('communityRevelationsManager', 'confirmDeleteRevelation', 'Are you sure you want to delete this revelation?'))) return;
    try {
      const { error } = await supabase.from('community_revelations').delete().eq('id', id);
      if (error) throw error;
      setRevelations(prev => prev.filter(r => r.id !== id));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: t('communityRevelationsManager', 'revelationDeleted', 'Revelation deleted') });
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRevEdit = (r: Revelation) => {
    setEditingRev(r);
    setRevForm({ title: r.title, content: r.content, scripture_reference: r.scripture_reference || '', category: r.category, is_featured: r.is_featured });
    setShowRevModal(true);
  };

  const handleRevSave = async () => {
    if (!editingRev) return;
    setRevSaving(true);
    try {
      const { error } = await supabase.from('community_revelations').update({
        title: revForm.title, content: revForm.content,
        scripture_reference: revForm.scripture_reference || null,
        category: revForm.category, is_featured: revForm.is_featured,
      }).eq('id', editingRev.id);
      if (error) throw error;
      setRevelations(prev => prev.map(r => r.id === editingRev.id ? { ...r, ...revForm } : r));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: t('communityRevelationsManager', 'revelationUpdated', 'Revelation updated') });
      setShowRevModal(false); setEditingRev(null);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast({ title: t('communityRevelationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setRevSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // Testimonies data
  // ─────────────────────────────────────────────

  const loadTestimonies = async () => {
    setTestLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_testimonies')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) { console.warn('Testimonies load error:', error.message); setTestimonies([]); return; }
      setTestimonies((data || []).map(t => ({ ...t, is_featured: t.is_featured ?? false })));
    } catch (err: any) {
      console.error('Error loading testimonies:', err);
      setTestimonies([]);
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestHide = async (id: string, hidden: boolean) => {
    try {
      const { error } = await supabase.from('app_testimonies').update({ is_hidden: hidden }).eq('id', id);
      if (error) throw error;
      setTestimonies(prev => prev.map(t => t.id === id ? { ...t, is_hidden: hidden } : t));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: hidden ? t('communityRevelationsManager', 'testimonyHidden', 'Testimony hidden') : t('communityRevelationsManager', 'testimonyVisible', 'Testimony visible') });
    } catch (err: any) {
      toast({ title: t('communityRevelationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleTestFeature = async (id: string, featured: boolean) => {
    try {
      const { error } = await supabase.from('app_testimonies').update({ is_featured: featured }).eq('id', id);
      if (error) throw error;
      setTestimonies(prev => prev.map(t => t.id === id ? { ...t, is_featured: featured } : t));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: featured ? t('communityRevelationsManager', 'testimonyFeatured', 'Testimony featured') : t('communityRevelationsManager', 'testimonyUnfeatured', 'Testimony unfeatured') });
    } catch (err: any) {
      toast({ title: t('communityRevelationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleTestDelete = async (id: string) => {
    if (!confirm(t('communityRevelationsManager', 'confirmDeleteTestimony', 'Are you sure you want to delete this testimony?'))) return;
    try {
      const { error } = await supabase.from('app_testimonies').delete().eq('id', id);
      if (error) throw error;
      setTestimonies(prev => prev.filter(t => t.id !== id));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: t('communityRevelationsManager', 'testimonyDeleted', 'Testimony deleted') });
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleTestEdit = (t: Testimony) => {
    setEditingTest(t);
    setTestForm({ title: t.title, content: t.content, category: t.category, is_published: t.is_published, is_hidden: t.is_hidden, is_featured: t.is_featured });
    setShowTestModal(true);
  };

  const handleTestSave = async () => {
    if (!editingTest) return;
    setTestSaving(true);
    try {
      const { error } = await supabase.from('app_testimonies').update({
        title: testForm.title, content: testForm.content, category: testForm.category,
        is_published: testForm.is_published, is_hidden: testForm.is_hidden, is_featured: testForm.is_featured,
      }).eq('id', editingTest.id);
      if (error) throw error;
      setTestimonies(prev => prev.map(t => t.id === editingTest.id ? { ...t, ...testForm } : t));
      toast({ title: t('communityRevelationsManager', 'success', 'Success'), description: t('communityRevelationsManager', 'testimonyUpdated', 'Testimony updated') });
      setShowTestModal(false); setEditingTest(null);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast({ title: t('communityRevelationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setTestSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────

  const filteredRevelations = revelations.filter(r => {
    const matchesSearch = r.title?.toLowerCase().includes(revSearch.toLowerCase()) || r.content?.toLowerCase().includes(revSearch.toLowerCase()) || r.user_name?.toLowerCase().includes(revSearch.toLowerCase());
    const matchesFilter = revFilter === 'all' || (revFilter === 'featured' && r.is_featured) || (revFilter === 'hidden' && r.is_hidden) || (revFilter === 'visible' && !r.is_hidden);
    return matchesSearch && matchesFilter;
  });

  const filteredTestimonies = testimonies.filter(t => {
    const matchesSearch = t.title?.toLowerCase().includes(testSearch.toLowerCase()) || t.content?.toLowerCase().includes(testSearch.toLowerCase()) || t.author?.toLowerCase().includes(testSearch.toLowerCase());
    const matchesFilter = testFilter === 'all' || (testFilter === 'visible' && !t.is_hidden) || (testFilter === 'hidden' && t.is_hidden) || (testFilter === 'featured' && t.is_featured);
    return matchesSearch && matchesFilter;
  });

  const revStats = {
    total: revelations.length,
    visible: revelations.filter(r => !r.is_hidden).length,
    hidden: revelations.filter(r => r.is_hidden).length,
    featured: revelations.filter(r => r.is_featured).length,
  };

  const testStats = {
    total: testimonies.length,
    visible: testimonies.filter(t => !t.is_hidden).length,
    hidden: testimonies.filter(t => t.is_hidden).length,
    featured: testimonies.filter(t => t.is_featured).length,
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="space-y-6">

      <CardHeader className="px-0 pt-0">
        <CardTitle>{t('communityRevelationsManager', 'communityContentManager', 'Community Content Manager')}</CardTitle>
      </CardHeader>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('revelations')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === 'revelations' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <BookOpen className="h-4 w-4" />
          {t('communityRevelationsManager', 'revelations', 'Revelations')}

        </button>
        <button
          onClick={() => setActiveTab('testimonies')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === 'testimonies' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Sparkles className="h-4 w-4" />
          {t('communityRevelationsManager', 'testimonies', 'Testimonies')}
        </button>
      </div>

      {/* ══════════════════════ REVELATIONS TAB ══════════════════════ */}
      {activeTab === 'revelations' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center"><BookOpen className="h-8 w-8 mx-auto mb-2 text-blue-500" /><p className="text-2xl font-bold">{revStats.total}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'total', 'Total')}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><Eye className="h-8 w-8 mx-auto mb-2 text-green-500" /><p className="text-2xl font-bold">{revStats.visible}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'visible', 'Visible')}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><EyeOff className="h-8 w-8 mx-auto mb-2 text-gray-400" /><p className="text-2xl font-bold">{revStats.hidden}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'hidden', 'Hidden')}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><Heart className="h-8 w-8 mx-auto mb-2 text-pink-500" /><p className="text-2xl font-bold">{revStats.featured}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'featured', 'Featured')}</p></CardContent></Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder={t('communityRevelationsManager', 'searchRevelations', 'Search revelations...')} value={revSearch} onChange={e => setRevSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={revFilter} onValueChange={(v: any) => setRevFilter(v)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('communityRevelationsManager', 'filterByStatus', 'Filter by status')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('communityRevelationsManager', 'allRevelations', 'All Revelations')}</SelectItem>
                <SelectItem value="visible">{t('communityRevelationsManager', 'visible', 'Visible')}</SelectItem>
                <SelectItem value="hidden">{t('communityRevelationsManager', 'hidden', 'Hidden')}</SelectItem>
                <SelectItem value="featured">{t('communityRevelationsManager', 'featured', 'Featured')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadRevelations}><RefreshCw className="h-4 w-4 mr-2" />{t('communityRevelationsManager', 'refresh', 'Refresh')}</Button>
          </div>

          {/* Revelations list */}
          {revLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>
          ) : filteredRevelations.length === 0 ? (
            <Card><CardContent className="p-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('communityRevelationsManager', 'noRevelationsFound', 'No Revelations Found')}</h3>
              <p className="text-gray-500">{revSearch || revFilter !== 'all' ? t('communityRevelationsManager', 'tryAdjustingFilter', 'Try adjusting your search or filter') : t('communityRevelationsManager', 'revelationsEmptyHint', 'Community revelations will appear here once users start sharing')}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {filteredRevelations.map(r => (
                <Card key={r.id} className={r.is_featured ? 'border-purple-300 bg-purple-50' : r.is_hidden ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{r.title}</h3>
                            <p className="text-sm text-gray-500">{r.user_name || t('communityRevelationsManager', 'anonymous', 'Anonymous')} • {new Date(r.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            {r.is_featured && <Badge className="bg-purple-600">{t('communityRevelationsManager', 'featured', 'Featured')}</Badge>}
                            {r.is_hidden ? <Badge variant="outline" className="text-gray-500 border-gray-300">{t('communityRevelationsManager', 'hidden', 'Hidden')}</Badge> : <Badge className="bg-green-600">{t('communityRevelationsManager', 'visible', 'Visible')}</Badge>}
                            <Badge variant="outline">{r.category}</Badge>
                          </div>
                        </div>
                        <p className="text-gray-700 mb-2 line-clamp-3">{r.content}</p>
                        {r.scripture_reference && <p className="text-sm text-purple-600 italic mb-2">{t('communityRevelationsManager', 'scriptureLabel', 'Scripture:')} {r.scripture_reference}</p>}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1"><Heart className="h-4 w-4" />{t('communityRevelationsManager', 'likesCount', '{count} likes').replace('{count}', String(r.likes_count || 0))}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-4 w-4" />{t('communityRevelationsManager', 'commentsCount', '{count} comments').replace('{count}', String(r.comments_count || 0))}</span>
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleRevHide(r.id, !r.is_hidden)}>
                          {r.is_hidden ? <><Eye className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'show', 'Show')}</> : <><EyeOff className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'hide', 'Hide')}</>}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRevFeature(r.id, !r.is_featured)} className={r.is_featured ? 'text-purple-600' : ''}>
                          <Heart className={`h-4 w-4 mr-1 ${r.is_featured ? 'fill-current' : ''}`} />{r.is_featured ? t('communityRevelationsManager', 'unfeature', 'Unfeature') : t('communityRevelationsManager', 'feature', 'Feature')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRevEdit(r)}><Edit className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'edit', 'Edit')}</Button>
                        <Button variant="outline" size="sm" onClick={() => handleRevDelete(r.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'delete', 'Delete')}</Button>
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
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center"><Sparkles className="h-8 w-8 mx-auto mb-2 text-amber-500" /><p className="text-2xl font-bold">{testStats.total}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'total', 'Total')}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><Eye className="h-8 w-8 mx-auto mb-2 text-green-500" /><p className="text-2xl font-bold">{testStats.visible}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'visible', 'Visible')}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><EyeOff className="h-8 w-8 mx-auto mb-2 text-gray-400" /><p className="text-2xl font-bold">{testStats.hidden}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'hidden', 'Hidden')}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><Star className="h-8 w-8 mx-auto mb-2 text-amber-500 fill-amber-400" /><p className="text-2xl font-bold">{testStats.featured}</p><p className="text-xs text-gray-500">{t('communityRevelationsManager', 'featured', 'Featured')}</p></CardContent></Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder={t('communityRevelationsManager', 'searchTestimonies', 'Search testimonies...')} value={testSearch} onChange={e => setTestSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={testFilter} onValueChange={(v: any) => setTestFilter(v)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('communityRevelationsManager', 'filterByStatus', 'Filter by status')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('communityRevelationsManager', 'allTestimonies', 'All Testimonies')}</SelectItem>
                <SelectItem value="visible">{t('communityRevelationsManager', 'visible', 'Visible')}</SelectItem>
                <SelectItem value="hidden">{t('communityRevelationsManager', 'hidden', 'Hidden')}</SelectItem>
                <SelectItem value="featured">{t('communityRevelationsManager', 'featured', 'Featured')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadTestimonies}><RefreshCw className="h-4 w-4 mr-2" />{t('communityRevelationsManager', 'refresh', 'Refresh')}</Button>
          </div>

          {/* Testimonies list */}
          {testLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
          ) : filteredTestimonies.length === 0 ? (
            <Card><CardContent className="p-12 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('communityRevelationsManager', 'noTestimoniesFound', 'No Testimonies Found')}</h3>
              <p className="text-gray-500">{testSearch || testFilter !== 'all' ? t('communityRevelationsManager', 'tryAdjustingFilter', 'Try adjusting your search or filter') : t('communityRevelationsManager', 'testimoniesEmptyHint', 'Community testimonies will appear here once users start sharing')}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {filteredTestimonies.map(tm => (
                <Card key={tm.id} className={`border-l-4 ${tm.is_featured ? 'border-l-amber-400 bg-amber-50' : tm.is_hidden ? 'border-l-gray-300 opacity-60' : 'border-l-amber-200'}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-lg flex items-center gap-1">
                              <Star className="h-4 w-4 text-amber-500 fill-amber-400" />{tm.title}
                            </h3>
                            <p className="text-sm text-gray-500">{tm.author || t('communityRevelationsManager', 'anonymous', 'Anonymous')} • {new Date(tm.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            {tm.is_featured && <Badge className="bg-amber-500">{t('communityRevelationsManager', 'featured', 'Featured')}</Badge>}
                            {tm.is_hidden ? <Badge variant="outline" className="text-gray-500 border-gray-300">{t('communityRevelationsManager', 'hidden', 'Hidden')}</Badge> : <Badge className="bg-green-600">{t('communityRevelationsManager', 'visible', 'Visible')}</Badge>}
                            <Badge variant="outline">{tm.category}</Badge>
                          </div>
                        </div>
                        <p className="text-gray-700 mb-2 line-clamp-3">{tm.content}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1"><Heart className="h-4 w-4" />{t('communityRevelationsManager', 'likesCount', '{count} likes').replace('{count}', String(tm.likes || 0))}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-4 w-4" />{t('communityRevelationsManager', 'commentsCount', '{count} comments').replace('{count}', String(tm.comments?.length || 0))}</span>
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleTestHide(tm.id, !tm.is_hidden)}>
                          {tm.is_hidden ? <><Eye className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'show', 'Show')}</> : <><EyeOff className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'hide', 'Hide')}</>}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleTestFeature(tm.id, !tm.is_featured)} className={tm.is_featured ? 'text-amber-600' : ''}>
                          <Star className={`h-4 w-4 mr-1 ${tm.is_featured ? 'fill-current' : ''}`} />{tm.is_featured ? t('communityRevelationsManager', 'unfeature', 'Unfeature') : t('communityRevelationsManager', 'feature', 'Feature')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleTestEdit(tm)}><Edit className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'edit', 'Edit')}</Button>
                        <Button variant="outline" size="sm" onClick={() => handleTestDelete(tm.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4 mr-1" />{t('communityRevelationsManager', 'delete', 'Delete')}</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Revelation Edit Modal ── */}
      <Dialog open={showRevModal} onOpenChange={setShowRevModal}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('communityRevelationsManager', 'editRevelation', 'Edit Revelation')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t('communityRevelationsManager', 'title', 'Title')}</Label><Input value={revForm.title} onChange={e => setRevForm({ ...revForm, title: e.target.value })} /></div>
            <div><Label>{t('communityRevelationsManager', 'content', 'Content')}</Label><Textarea value={revForm.content} onChange={e => setRevForm({ ...revForm, content: e.target.value })} rows={5} /></div>
            <div><Label>{t('communityRevelationsManager', 'scriptureReference', 'Scripture Reference')}</Label><Input value={revForm.scripture_reference} onChange={e => setRevForm({ ...revForm, scripture_reference: e.target.value })} placeholder={t('communityRevelationsManager', 'scriptureExample', 'e.g., John 3:16')} /></div>
            <div>
              <Label>{t('communityRevelationsManager', 'category', 'Category')}</Label>
              <Select value={revForm.category} onValueChange={v => setRevForm({ ...revForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="testimony">{t('communityRevelationsManager', 'categoryTestimony', 'Testimony')}</SelectItem>
                  <SelectItem value="revelation">{t('communityRevelationsManager', 'categoryRevelation', 'Revelation')}</SelectItem>
                  <SelectItem value="insight">{t('communityRevelationsManager', 'categoryInsight', 'Insight')}</SelectItem>
                  <SelectItem value="encouragement">{t('communityRevelationsManager', 'categoryEncouragement', 'Encouragement')}</SelectItem>
                  <SelectItem value="prayer_answer">{t('communityRevelationsManager', 'categoryPrayerAnswer', 'Prayer Answer')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={revForm.is_featured} onCheckedChange={c => setRevForm({ ...revForm, is_featured: c })} /><Label>{t('communityRevelationsManager', 'featured', 'Featured')}</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevModal(false)}>{t('communityRevelationsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleRevSave} disabled={revSaving}>
              {revSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('communityRevelationsManager', 'saving', 'Saving...')}</> : t('communityRevelationsManager', 'saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Testimony Edit Modal ── */}
      <Dialog open={showTestModal} onOpenChange={setShowTestModal}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('communityRevelationsManager', 'editTestimony', 'Edit Testimony')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t('communityRevelationsManager', 'title', 'Title')}</Label><Input value={testForm.title} onChange={e => setTestForm({ ...testForm, title: e.target.value })} /></div>
            <div><Label>{t('communityRevelationsManager', 'content', 'Content')}</Label><Textarea value={testForm.content} onChange={e => setTestForm({ ...testForm, content: e.target.value })} rows={5} /></div>
            <div>
              <Label>{t('communityRevelationsManager', 'category', 'Category')}</Label>
              <Select value={testForm.category} onValueChange={v => setTestForm({ ...testForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TESTIMONY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={!testForm.is_hidden} onCheckedChange={c => setTestForm({ ...testForm, is_hidden: !c })} /><Label>{t('communityRevelationsManager', 'visible', 'Visible')}</Label></div>
              <div className="flex items-center gap-2"><Switch checked={testForm.is_featured} onCheckedChange={c => setTestForm({ ...testForm, is_featured: c })} /><Label>{t('communityRevelationsManager', 'featured', 'Featured')}</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestModal(false)}>{t('communityRevelationsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleTestSave} disabled={testSaving} className="bg-amber-500 hover:bg-amber-600">
              {testSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('communityRevelationsManager', 'saving', 'Saving...')}</> : t('communityRevelationsManager', 'saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default CommunityRevelationsManager;