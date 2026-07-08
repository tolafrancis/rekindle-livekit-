import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { PenLine, Check, Clock, Search, Plus, BookOpen, Heart, Filter, Lock, Crown } from 'lucide-react';
import { toast } from './ui/use-toast';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { UpgradePromptModal } from './UpgradePromptModal';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from './SearchFilterPanel';
import { useLanguage } from '@/contexts/LanguageContext';

interface JournalEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  date: string;
  answered: boolean;
  answeredDate?: string;
}

const categories = ['Thanksgiving', 'Petition', 'Intercession', 'Confession', 'Worship', 'Guidance'];

const initialEntries: JournalEntry[] = [
  { id: '1', title: 'Guidance for Career', content: 'Lord, I seek Your wisdom for the job opportunity. Guide my steps and open the right doors.', category: 'Guidance', date: '2024-12-03', answered: false },
  { id: '2', title: 'Healing for Mom', content: 'Father, I lift up my mother\'s health to You. Touch her body and restore her completely.', category: 'Intercession', date: '2024-12-01', answered: true, answeredDate: '2024-12-03' },
  { id: '3', title: 'Grateful Heart', content: 'Thank You Lord for Your faithfulness. You have been so good to me and my family.', category: 'Thanksgiving', date: '2024-11-28', answered: false },
  { id: '4', title: 'Financial Breakthrough', content: 'God, I trust You for provision. Help me to be a good steward of what You give.', category: 'Petition', date: '2024-11-25', answered: false }
];

export const PrayerJournal: React.FC = () => {
  const entitlements = useUserEntitlements();
  const { t } = useLanguage();

  // Category display labels (values stay English for filtering/logic).
  const catLabel = (cat: string): string => {
    const map: Record<string, string> = {
      Thanksgiving: t('prayers', 'catThanksgiving', 'Thanksgiving'),
      Petition: t('prayers', 'catPetition', 'Petition'),
      Intercession: t('prayers', 'catIntercession', 'Intercession'),
      Confession: t('prayers', 'catConfession', 'Confession'),
      Worship: t('prayers', 'catWorship', 'Worship'),
      Guidance: t('prayers', 'catGuidance', 'Guidance'),
    };
    return map[cat] || cat;
  };

  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // The prayer journal is unlimited for everyone (no per-tier cap exists in the
  // flat entitlements model), so there is no limit to enforce.
  const maxJournalEntries: number | null = null;
  const hasLimit = maxJournalEntries !== null && maxJournalEntries !== undefined;
  const isAtLimit = hasLimit && entries.length >= maxJournalEntries;
  const { activePrompt, show: showUpgradePrompt, dismiss: dismissUpgradePrompt } = useUpgradePrompt();

  const handleSubmit = () => {
    if (!title.trim() || !content.trim() || !category) { 
      toast({ title: t('common', 'error', 'Error'), description: t('prayers', 'fillAllFields', 'Please fill in all fields'), variant: 'destructive' });
      return; 
    }
    
    // Check entry limit
    if (isAtLimit) {
      return;
    }
    
    const newEntry: JournalEntry = { 
      id: Date.now().toString(), 
      title, 
      content, 
      category, 
      date: new Date().toISOString().split('T')[0], 
      answered: false 
    };
    setEntries(prev => [newEntry, ...prev]);
    setTitle(''); 
    setContent(''); 
    setCategory(''); 
    setShowForm(false);
    toast({ title: t('prayers', 'prayerAdded', 'Prayer Added'), description: t('prayers', 'prayerAddedDesc', 'Your prayer has been recorded in your journal') });
  };

  const markAnswered = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, answered: true, answeredDate: new Date().toISOString().split('T')[0] } : e));
    toast({ title: t('prayers', 'praiseGod', 'Praise God!'), description: t('prayers', 'prayerMarkedAnswered', 'Prayer marked as answered') });
  };

  const filtered = entries.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) || e.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || e.category === filterCategory;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'answered' ? e.answered : !e.answered);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = { Thanksgiving: 'bg-green-100 text-green-800', Petition: 'bg-blue-100 text-blue-800', Intercession: 'bg-purple-100 text-purple-800', Confession: 'bg-red-100 text-red-800', Worship: 'bg-amber-100 text-amber-800', Guidance: 'bg-teal-100 text-teal-800' };
    return colors[cat] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Entry Limit Banner */}
      {hasLimit && (
        <Alert className={isAtLimit ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}>
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Journal Entries: {entries.length} / {maxJournalEntries}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {isAtLimit 
                    ? 'Entry limit reached - Upgrade for unlimited entries' 
                    : `You can add ${maxJournalEntries - entries.length} more entr${maxJournalEntries - entries.length === 1 ? 'y' : 'ies'}`
                  }
                </p>
              </div>
              {isAtLimit && (
                <Button 
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => window.location.href = '/subscribe'}
                >
                  <Crown className="h-3 w-3 mr-1" />
                  Upgrade
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex items-center justify-end flex-wrap gap-4">
        <Button 
          onClick={() => {
            if (isAtLimit) {
              toast({
                title: 'Entry Limit Reached',
                description: `You have reached your limit of ${maxJournalEntries} entries`,
                variant: 'destructive'
              });
              return;
            }
            setShowForm(!showForm);
          }}
          disabled={isAtLimit}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {isAtLimit && <Lock className="h-4 w-4 mr-2" />}
          <Plus className="h-4 w-4 mr-2" />
          {showForm ? t('common', 'cancel', 'Cancel') : t('prayers', 'newEntry', 'New Entry')}
        </Button>
      </div>
      {showForm && (
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="pt-6 space-y-4">
            <Input placeholder={t('prayers', 'prayerTitlePlaceholder', 'Prayer title...')} value={title} onChange={e => setTitle(e.target.value)} />
            <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue placeholder={t('prayers', 'selectCategory', 'Select category')} /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>)}</SelectContent></Select>
            <Textarea placeholder={t('prayers', 'pourHeartPlaceholder', 'Pour out your heart to God...')} value={content} onChange={e => setContent(e.target.value)} rows={5} />
            <Button onClick={handleSubmit} className="w-full"><PenLine className="h-4 w-4 mr-2" /> {t('prayers', 'savePrayer', 'Save Prayer')}</Button>
          </CardContent>
        </Card>
      )}
      <SearchFilterPanel>
        <div className="relative flex-1 min-w-[200px]"><Search className={searchFilterIconClass} /><Input placeholder={t('prayers', 'searchPrayers', 'Search prayers...')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={searchFilterInputClass} /></div>
        <Select value={filterCategory} onValueChange={setFilterCategory}><SelectTrigger className={`w-full md:w-40 ${searchFilterSelectTriggerClass}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('prayers', 'allCategories', 'All Categories')}</SelectItem>{categories.map(c => <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>)}</SelectContent></Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className={`w-full md:w-36 ${searchFilterSelectTriggerClass}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('prayers', 'allStatus', 'All Status')}</SelectItem><SelectItem value="pending">{t('prayers', 'pending', 'Pending')}</SelectItem><SelectItem value="answered">{t('prayers', 'answered', 'Answered')}</SelectItem></SelectContent></Select>
      </SearchFilterPanel>
      <div className="grid gap-4">
        {filtered.map(entry => (
          <Card key={entry.id} className={`transition-all hover:shadow-md ${entry.answered ? 'border-green-200 bg-green-50/30' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2"><h3 className="font-semibold text-lg">{entry.title}</h3><Badge className={getCategoryColor(entry.category)}>{catLabel(entry.category)}</Badge>{entry.answered && <Badge className="bg-green-500 text-white"><Check className="h-3 w-3 mr-1" />{t('prayers', 'answered', 'Answered')}</Badge>}</div>
                  <p className="text-gray-600 mb-3">{entry.content}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500"><span className="flex items-center gap-1"><Clock className="h-4 w-4" />{entry.date}</span>{entry.answeredDate && <span className="text-green-600">{t('prayers', 'answered', 'Answered')}: {entry.answeredDate}</span>}</div>
                </div>
                {!entry.answered && <Button variant="outline" size="sm" onClick={() => markAnswered(entry.id)} className="text-green-600 border-green-300 hover:bg-green-50"><Check className="h-4 w-4 mr-1" />{t('prayers', 'answered', 'Answered')}</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-gray-500"><BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>{t('prayers', 'noPrayersFound', 'No prayers found. Start journaling your prayers!')}</p></div>}
      </div>
      {/* Upgrade Prompt */}
      <UpgradePromptModal
        prompt={activePrompt}
        onClose={dismissUpgradePrompt}
        onUpgrade={() => {}}
      />
    </div>
  );
};
