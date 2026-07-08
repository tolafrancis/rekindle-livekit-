import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { supabase } from '@/lib/supabase';
import { getCategoryColor } from '@/lib/categoryDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import {
  Bookmark, Search, Calendar, BookOpen, Trash2, 
  ExternalLink, Filter, SortAsc, X
} from 'lucide-react';
import {
  SearchFilterPanel,
  activeFilterChipClass,
  filterChipClass,
  searchFilterIconClass,
  searchFilterInputClass
} from './SearchFilterPanel';

interface BookmarkedDevotional {
  id: string;
  entry_id: string;
  series_id: string;
  series_title: string;
  series_category: string;
  entry_day_number: number;
  entry_title: string;
  entry_scripture: string;
  notes: string;
  created_at: string;
}

export const DevotionalBookmarks: React.FC<{
  onOpenDevotional?: (seriesId: string, entryId: string) => void;
}> = ({ onOpenDevotional }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [bookmarks, setBookmarks] = useState<BookmarkedDevotional[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<BookmarkedDevotional[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'series' | 'day'>('recent');

  useEffect(() => {
    if (user) {
      loadBookmarks();
    }
  }, [user]);

  useEffect(() => {
    filterAndSortBookmarks();
  }, [bookmarks, searchTerm, categoryFilter, sortBy]);

  const loadBookmarks = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('devotional_bookmarks')
        .select(`
          id,
          entry_id,
          series_id,
          notes,
          created_at,
          devotional_entries (
            day_number,
            title,
            scripture_reference
          ),
          devotional_series (
            title,
            devotional_categories (
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const transformedBookmarks: BookmarkedDevotional[] = (data || []).map((b: any) => ({
        id: b.id,
        entry_id: b.entry_id,
        series_id: b.series_id,
        series_title: b.devotional_series?.title || 'Unknown Series',
        series_category: b.devotional_series?.devotional_categories?.name || 'Uncategorized',
        entry_day_number: b.devotional_entries?.day_number || 0,
        entry_title: b.devotional_entries?.title || 'Untitled',
        entry_scripture: b.devotional_entries?.scripture_reference || '',
        notes: b.notes || '',
        created_at: b.created_at
      }));

      setBookmarks(transformedBookmarks);
    } catch (err: any) {
      console.error('Error loading bookmarks:', err);
      toast({ title: t('devotionalBookmarks', 'error', 'Error'), description: t('devotionalBookmarks', 'failedToLoad', 'Failed to load bookmarks'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortBookmarks = () => {
    let filtered = [...bookmarks];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        b =>
          b.series_title.toLowerCase().includes(searchLower) ||
          b.entry_title.toLowerCase().includes(searchLower) ||
          b.entry_scripture.toLowerCase().includes(searchLower) ||
          b.notes.toLowerCase().includes(searchLower)
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(b => b.series_category === categoryFilter);
    }

    // Apply sorting
    switch (sortBy) {
      case 'recent':
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'series':
        filtered.sort((a, b) => a.series_title.localeCompare(b.series_title));
        break;
      case 'day':
        filtered.sort((a, b) => a.entry_day_number - b.entry_day_number);
        break;
    }

    setFilteredBookmarks(filtered);
  };

  const handleDeleteBookmark = async (id: string) => {
    if (!confirm(t('devotionalBookmarks', 'confirmRemove', 'Remove this bookmark?'))) return;

    try {
      const { error } = await supabase
        .from('devotional_bookmarks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setBookmarks(bookmarks.filter(b => b.id !== id));
      toast({ title: t('devotionalBookmarks', 'bookmarkRemoved', 'Bookmark Removed') });
    } catch (err: any) {
      console.error('Error deleting bookmark:', err);
      toast({ title: t('devotionalBookmarks', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const categories = Array.from(new Set(bookmarks.map(b => b.series_category)));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('devotionalBookmarks', 'loadingBookmarks', 'Loading bookmarks...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('devotionalBookmarks', 'savedDevotionals', 'Saved Devotionals')}</h2>
          <p className="text-gray-600">
            {bookmarks.length} {bookmarks.length === 1 ? t('devotionalBookmarks', 'bookmark', 'bookmark') : t('devotionalBookmarks', 'bookmarks', 'bookmarks')}
          </p>
        </div>
        <Bookmark className="h-8 w-8 text-purple-600" />
      </div>

      {/* Filters */}
      <SearchFilterPanel icon={<Filter className="h-6 w-6 text-white/60" />}>
        <div className="relative flex-1">
          <Search className={searchFilterIconClass} />
          <Input
            placeholder={t('devotionalBookmarks', 'searchPlaceholder', 'Search bookmarks...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${searchFilterInputClass} pr-10`}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-purple-200" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCategoryFilter('all')}
            className={categoryFilter === 'all' ? activeFilterChipClass : filterChipClass}
          >
            {t('devotionalBookmarks', 'all', 'All')}
          </Button>
          {categories.map(cat => (
            <Button
              key={cat}
              variant="ghost"
              size="sm"
              onClick={() => setCategoryFilter(cat)}
              className={categoryFilter === cat ? activeFilterChipClass : filterChipClass}
            >
              <span className="inline-block h-2 w-2 mr-1.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(cat) }} />
              {cat}
            </Button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const sorts: Array<'recent' | 'series' | 'day'> = ['recent', 'series', 'day'];
            const currentIndex = sorts.indexOf(sortBy);
            setSortBy(sorts[(currentIndex + 1) % sorts.length]);
          }}
          title={t('devotionalBookmarks', 'sortBy', 'Sort by')}
          className={filterChipClass}
        >
          <SortAsc className="h-4 w-4 mr-2" />
          {sortBy === 'recent' ? t('devotionalBookmarks', 'sortRecent', 'Recent') : sortBy === 'series' ? t('devotionalBookmarks', 'sortSeries', 'Series') : t('devotionalBookmarks', 'sortDay', 'Day')}
        </Button>
      </SearchFilterPanel>

      {/* Bookmarks List */}
      {filteredBookmarks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bookmark className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              {searchTerm || categoryFilter !== 'all'
                ? t('devotionalBookmarks', 'noBookmarksFound', 'No bookmarks found')
                : t('devotionalBookmarks', 'noBookmarksYet', 'No bookmarks yet')}
            </h3>
            <p className="text-gray-500">
              {searchTerm || categoryFilter !== 'all'
                ? t('devotionalBookmarks', 'tryAdjustingFilters', 'Try adjusting your filters')
                : t('devotionalBookmarks', 'startBookmarking', 'Start bookmarking devotionals to save them here!')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredBookmarks.map(bookmark => (
            <Card key={bookmark.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {t('devotionalBookmarks', 'dayLabel', 'Day {n}').replace('{n}', String(bookmark.entry_day_number))}
                      </Badge>
                      <Badge variant="secondary" className="text-xs flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(bookmark.series_category) }} />
                        {bookmark.series_category}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm text-gray-600 mb-1">
                      {bookmark.series_title}
                    </h3>
                    <h4 className="font-semibold text-lg mb-2">
                      {bookmark.entry_title}
                    </h4>
                  </div>
                </div>

                {bookmark.entry_scripture && (
                  <p className="text-sm text-purple-600 mb-3">
                    {bookmark.entry_scripture}
                  </p>
                )}

                {bookmark.notes && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <p className="text-xs text-gray-500 mb-1">{t('devotionalBookmarks', 'yourNotes', 'Your Notes:')}</p>
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {bookmark.notes}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {t('devotionalBookmarks', 'savedDate', 'Saved {date}').replace('{date}', new Date(bookmark.created_at).toLocaleDateString())}
                  </span>
                </div>

                <div className="flex gap-2">
                  {onOpenDevotional && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => onOpenDevotional(bookmark.series_id, bookmark.entry_id)}
                    >
                      <BookOpen className="h-3 w-3 mr-2" />
                      {t('devotionalBookmarks', 'read', 'Read')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteBookmark(bookmark.id)}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {filteredBookmarks.length > 0 && (
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4 flex items-center gap-4">
            <BookOpen className="h-10 w-10 text-purple-600" />
            <div>
              <p className="font-semibold text-purple-900">
                {(filteredBookmarks.length === 1
                  ? t('devotionalBookmarks', 'devotionalSavedOne', '{count} devotional saved')
                  : t('devotionalBookmarks', 'devotionalSavedMany', '{count} devotionals saved')
                ).replace('{count}', String(filteredBookmarks.length))}
              </p>
              <p className="text-sm text-purple-700">
                {t('devotionalBookmarks', 'keepBuilding', 'Keep building your personal devotional library!')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
