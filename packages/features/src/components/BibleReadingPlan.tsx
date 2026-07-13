import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Progress } from '@rekindle/ui/progress';
import { Badge } from '@rekindle/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { readingPlans, ReadingPlan } from '../data/readingPlans';
import { BookOpen, Check, Calendar, ChevronRight, ArrowLeft, Clock, Target, ChevronDown, ChevronUp, Loader2, AlertCircle, Search } from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from './SearchFilterPanel';

const bibleVersions = [
  { id: 'kjv', name: 'King James Version', abbr: 'KJV' },
  { id: 'web', name: 'World English Bible', abbr: 'WEB' },
  { id: 'basicenglish', name: 'Basic English Bible', abbr: 'BBE' },
  { id: 'darby', name: 'Darby Translation', abbr: 'DARBY' },
  { id: 'ylt', name: 'Young\'s Literal Translation', abbr: 'YLT' }
];
// Fetch Bible text from API
const fetchBibleText = async (passage: string, version: string = 'kjv'): Promise<{ text: string; error?: string }> => {
  try {
    const formattedPassage = passage.trim();
    const url = `https://bible-api.com/${encodeURIComponent(formattedPassage)}?translation=${version}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to fetch scripture');
    }
    
    const data = await response.json();
    
    let text = '';
    if (data.text) {
      text = data.text;
    } else if (data.verses && Array.isArray(data.verses)) {
      text = data.verses.map((v: any) => v.text).join('\n\n');
    }
    
    return { text: text || 'Scripture text not available' };
  } catch (error) {
    console.error('Error fetching Bible text:', error);
    return { 
      text: '', 
      error: 'Unable to load scripture. Please check your internet connection or try a different version.' 
    };
  }
};

export const BibleReadingPlan: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [activePlan, setActivePlan] = useState<ReadingPlan | null>(null);
  const [completedDays, setCompletedDays] = useState<Record<string, number[]>>({});
  const [currentDay, setCurrentDay] = useState(1);
  const [selectedVersion, setSelectedVersion] = useState('kjv');
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [loadingText, setLoadingText] = useState<Record<number, boolean>>({});
  const [bibleTexts, setBibleTexts] = useState<Record<number, { text: string; error?: string }>>({});
  const [allReadingPlans, setAllReadingPlans] = useState<ReadingPlan[]>(readingPlans);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Load custom reading plans from storage on mount and set up refresh interval
  useEffect(() => {
    loadCustomPlans();
    
    // Set up interval to check for new custom plans every 5 seconds
    const interval = setInterval(() => {
      loadCustomPlans();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Load completed days — DB first, localStorage as fallback
  useEffect(() => {
    const loadCompletedDays = async () => {
      try {
        if (user) {
          const { data } = await supabase
            .from('user_reading_progress')
            .select('progress_data')
            .eq('user_id', user.id)
            .single();
          if (data?.progress_data) {
            setCompletedDays(data.progress_data);
            localStorage.setItem('reading-plan-progress', JSON.stringify(data.progress_data));
            return;
          }
        }
        // Fallback to localStorage (unauthenticated or no DB record yet)
        const stored = localStorage.getItem('reading-plan-progress');
        if (stored) setCompletedDays(JSON.parse(stored));
      } catch (error) {
        const stored = localStorage.getItem('reading-plan-progress');
        if (stored) setCompletedDays(JSON.parse(stored));
      }
    };
    loadCompletedDays();
  }, [user]);

  // Save completed days — DB + localStorage cache
  useEffect(() => {
    const saveCompletedDays = async () => {
      try {
        // Always update local cache immediately
        localStorage.setItem('reading-plan-progress', JSON.stringify(completedDays));
        // Persist to DB if authenticated
        if (user) {
          await supabase
            .from('user_reading_progress')
            .upsert({ user_id: user.id, progress_data: completedDays, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' });
        }
      } catch (error) {
        console.error('Error saving progress:', error);
      }
    };
    if (Object.keys(completedDays).length > 0) {
      saveCompletedDays();
    }
  }, [completedDays, user]);

  const loadCustomPlans = async () => {
    try {
      let customPlans: ReadingPlan[] = [];
      if (user) {
        const { data } = await supabase
          .from('user_reading_plans')
          .select('plan_data')
          .eq('user_id', user.id);
        if (data && data.length > 0) {
          customPlans = data.map(r => r.plan_data);
        }
      } else {
        // Fallback localStorage for unauthenticated
        const stored = localStorage.getItem('custom-reading-plans');
        if (stored) customPlans = JSON.parse(stored);
      }
      if (customPlans.length > 0) {
        setAllReadingPlans([...readingPlans, ...customPlans]);
      }
    } catch (error) {
      const stored = localStorage.getItem('custom-reading-plans');
      if (stored) {
        const plans = JSON.parse(stored);
        setAllReadingPlans([...readingPlans, ...plans]);
      }
    }
  };

  const loadBibleTextForDay = async (day: number, passages: string[]) => {
    if (bibleTexts[day]) return;
    
    setLoadingText(prev => ({ ...prev, [day]: true }));
    
    try {
      // Load all passages for the day
      const results = await Promise.all(
        passages.map(passage => fetchBibleText(passage, selectedVersion))
      );
      
      // Check if any passage had an error
      const hasError = results.some(r => r.error);
      
      if (hasError) {
        setBibleTexts(prev => ({ 
          ...prev, 
          [day]: {
            text: '',
            error: t('bibleReadingPlan', 'somePassagesError', 'Some passages could not be loaded. Please check your internet connection.')
          }
        }));
      } else {
        // Combine all passage texts with passage references
        const combinedText = results
          .map((result, index) => `📖 ${passages[index]}\n\n${result.text}`)
          .join('\n\n━━━━━━━━━━━━━━━\n\n');
        
        setBibleTexts(prev => ({ ...prev, [day]: { text: combinedText } }));
      }
    } catch (error) {
      setBibleTexts(prev => ({ 
        ...prev, 
        [day]: {
          text: '',
          error: t('bibleReadingPlan', 'loadScriptureError', 'Failed to load scripture text. Please try again later.')
        }
      }));
    } finally {
      setLoadingText(prev => ({ ...prev, [day]: false }));
    }
  };

  // Reload text when version changes
  useEffect(() => {
    if (expandedDay && activePlan) {
      setBibleTexts({});
      const reading = activePlan.readings.find(r => r.day === expandedDay);
      if (reading) {
        loadBibleTextForDay(expandedDay, reading.passages);
      }
    }
  }, [selectedVersion]);

  const startPlan = (plan: ReadingPlan) => {
    setActivePlan(plan);
    setCurrentDay(1);
    setBibleTexts({});
    if (!completedDays[plan.id]) {
      setCompletedDays(prev => ({ ...prev, [plan.id]: [] }));
    }
    toast({ title: t('bibleReadingPlan', 'planStartedTitle', 'Plan Started!'), description: t('bibleReadingPlan', 'planStartedDesc', 'You\'ve started "{name}"').replace('{name}', String(plan.name)) });
  };

  const markDayComplete = (day: number) => {
    if (!activePlan) return;
    setCompletedDays(prev => {
      const planDays = prev[activePlan.id] || [];
      if (planDays.includes(day)) return prev;
      return { ...prev, [activePlan.id]: [...planDays, day] };
    });
    if (day === activePlan.totalDays) {
      toast({
        title: t('bibleReadingPlan', 'congratsTitle', 'Congratulations!'),
        description: t('bibleReadingPlan', 'planCompletedDesc', 'You completed the reading plan!')
      });
    } else {
      toast({
        title: t('bibleReadingPlan', 'dayCompleteTitle', 'Day Complete!'),
        description: t('bibleReadingPlan', 'dayMarkedReadDesc', 'Day {day} marked as read').replace('{day}', String(day))
      });
      if (day === currentDay && day < activePlan.totalDays) {
        setCurrentDay(day + 1);
      }
    }
    setExpandedDay(null);
  };

  const getProgress = (planId: string, total: number) => {
    const completed = completedDays[planId]?.length || 0;
    return Math.round((completed / total) * 100);
  };

  const readingPlanCategories = Array.from(new Set(allReadingPlans.map(plan => plan.category).filter(Boolean)));
  const filteredReadingPlans = allReadingPlans.filter((plan) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      plan.name.toLowerCase().includes(query) ||
      plan.description.toLowerCase().includes(query) ||
      plan.category.toLowerCase().includes(query);
    const matchesCategory = categoryFilter === 'all' || plan.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const toggleDayExpansion = (day: number, passages: string[]) => {
    const newExpandedDay = expandedDay === day ? null : day;
    setExpandedDay(newExpandedDay);
    
    if (newExpandedDay !== null && !bibleTexts[day]) {
      loadBibleTextForDay(day, passages);
    }
  };

  if (activePlan) {
    const progress = getProgress(activePlan.id, activePlan.totalDays);
    const completed = completedDays[activePlan.id] || [];
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setActivePlan(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" />{t('bibleReadingPlan', 'back', 'Back')}
            </Button>
            <h2 className="text-2xl font-serif font-bold">{activePlan.name}</h2>
          </div>
          
          <Select value={selectedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bibleVersions.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium">{v.abbr}</span>
                    <span className="text-gray-500 ml-2 text-sm truncate">{v.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Card className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-purple-200 text-sm">{t('bibleReadingPlan', 'yourProgress', 'Your Progress')}</p>
                <p className="text-3xl font-bold">{progress}%</p>
              </div>
              <div className="text-right">
                <p className="text-purple-200 text-sm">{t('bibleReadingPlan', 'daysCompleted', 'Days Completed')}</p>
                <p className="text-3xl font-bold">{completed.length}/{activePlan.totalDays}</p>
              </div>
            </div>
            <Progress value={progress} className="h-3 bg-purple-400" />
            <p className="text-sm text-purple-200 mt-2">
              {t('bibleReadingPlan', 'readingIn', 'Reading in:')} {bibleVersions.find(v => v.id === selectedVersion)?.name}
            </p>
          </CardContent>
        </Card>
        
        <div className="grid gap-3">
          {activePlan.readings.map(reading => {
            const isCompleted = completed.includes(reading.day);
            const isCurrent = reading.day === currentDay;
            const isExpanded = expandedDay === reading.day;
            const isLoading = loadingText[reading.day];
            const textData = bibleTexts[reading.day];
            
            return (
              <Card 
                key={reading.day} 
                className={`transition-all ${
                  isCompleted 
                    ? 'bg-green-50 border-green-200' 
                    : isCurrent 
                    ? 'bg-purple-50 border-purple-300 shadow-md' 
                    : 'hover:shadow-sm'
                }`}
              >
                <CardContent className="py-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleDayExpansion(reading.day, reading.passages)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        isCompleted 
                          ? 'bg-green-500 text-white' 
                          : isCurrent 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isCompleted ? <Check className="h-5 w-5" /> : reading.day}
                      </div>
                      <div>
                        <p className="font-medium">{t('bibleReadingPlan', 'dayLabel', 'Day {day}').replace('{day}', String(reading.day))}</p>
                        <p className="text-sm text-gray-600">{reading.passages.join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isCompleted && (
                        <Button 
                          size="sm" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            markDayComplete(reading.day); 
                          }} 
                          className={isCurrent ? 'bg-purple-600' : ''}
                        >
                          <Check className="h-4 w-4 mr-1" />{t('bibleReadingPlan', 'complete', 'Complete')}
                        </Button>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="bg-white rounded-lg p-4 shadow-inner">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-purple-800">
                            {reading.passages.join(', ')}
                          </h4>
                          <Badge variant="outline" className="bg-purple-50">
                            {bibleVersions.find(v => v.id === selectedVersion)?.abbr}
                          </Badge>
                        </div>
                        
                        {isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                            <span className="ml-2 text-gray-600">{t('bibleReadingPlan', 'loadingScripture', 'Loading scripture...')}</span>
                          </div>
                        ) : textData?.error ? (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{textData.error}</AlertDescription>
                          </Alert>
                        ) : (
                          <div className="prose prose-sm max-w-none max-h-96 overflow-y-auto">
                            <p className="text-gray-700 leading-relaxed whitespace-pre-line text-base">
                              {textData?.text || t('bibleReadingPlan', 'loading', 'Loading...')}
                            </p>
                          </div>
                        )}
                        
                        {!isCompleted && textData?.text && (
                          <div className="mt-4 pt-4 border-t">
                            <Button 
                              onClick={() => markDayComplete(reading.day)}
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              <Check className="h-4 w-4 mr-2" />
                              {t('bibleReadingPlan', 'markAsComplete', 'Mark as Complete')}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SearchFilterPanel icon={<BookOpen className="h-6 w-6 text-white/60" />}>
        <div className="relative flex-1">
          <Search className={searchFilterIconClass} />
          <Input
            placeholder={t('bibleReadingPlan', 'searchPlaceholder', 'Search reading plans...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={searchFilterInputClass}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={`w-full md:w-56 ${searchFilterSelectTriggerClass}`}>
            <SelectValue placeholder={t('bibleReadingPlan', 'category', 'Category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('bibleReadingPlan', 'allCategories', 'All Categories')}</SelectItem>
            {readingPlanCategories.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SearchFilterPanel>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredReadingPlans.map(plan => {
          const progress = getProgress(plan.id, plan.totalDays);
          const started = completedDays[plan.id]?.length > 0;
          
          return (
            <Card 
              key={plan.id} 
              className="hover:shadow-lg transition-all cursor-pointer group" 
              onClick={() => startPlan(plan)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Badge variant="secondary">{plan.category}</Badge>
                  {started && (
                    <Badge className="bg-purple-100 text-purple-700">{progress}%</Badge>
                  )}
                </div>
                <CardTitle className="text-xl group-hover:text-purple-600 transition-colors">
                  {plan.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-gray-500">
                    <Clock className="h-4 w-4" />{plan.duration}
                  </span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <Target className="h-4 w-4" />{t('bibleReadingPlan', 'daysCount', '{count} days').replace('{count}', String(plan.totalDays))}
                  </span>
                </div>
                {started && <Progress value={progress} className="mt-3 h-2" />}
                <Button 
                  className="w-full mt-4 group-hover:bg-purple-600" 
                  variant={started ? "default" : "outline"}
                >
                  {started ? t('bibleReadingPlan', 'continue', 'Continue') : t('bibleReadingPlan', 'startPlan', 'Start Plan')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {filteredReadingPlans.length === 0 && (
        <Card className="p-12 text-center">
          <BookOpen className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">{t('bibleReadingPlan', 'noPlansFound', 'No Reading Plans Found')}</h3>
          <p className="text-gray-500">{t('bibleReadingPlan', 'noPlansHint', 'Try adjusting your search or category filter')}</p>
        </Card>
      )}
    </div>
  );
};
