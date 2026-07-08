import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { toast } from './ui/use-toast';
import { Bell, Book, BookOpen, Users, Clock, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface Reminder {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
  time: string;
  color: string;
}

const defaultReminders: Reminder[] = [
  { id: 'bible',      name: 'Bible Reading',     description: 'Daily scripture reading reminder',    icon: Book,     enabled: true,  time: '06:00', color: 'text-amber-600' },
  { id: 'book',       name: 'Book Summary',       description: 'Christian book summary of the day',   icon: BookOpen, enabled: false, time: '12:00', color: 'text-blue-600' },
  { id: 'prayer',     name: 'Prayer Challenge',   description: 'Daily prayer challenge reminder',     icon: Users,    enabled: true,  time: '07:00', color: 'text-purple-600' },
  { id: 'devotional', name: 'Daily Devotional',   description: 'Morning devotional reminder',         icon: Bell,     enabled: true,  time: '05:30', color: 'text-green-600' },
  { id: 'memory',     name: 'Scripture Memory',   description: 'Verse memorization practice',         icon: Clock,    enabled: false, time: '20:00', color: 'text-rose-600' },
];

export const DailyReminders: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [reminders, setReminders] = useState<Reminder[]>(defaultReminders);

  // Localized display labels for each reminder (name/description are data values in defaultReminders)
  const reminderLabels: Record<string, { name: string; description: string }> = {
    bible:      { name: t('dailyReminders', 'bibleName', 'Bible Reading'),     description: t('dailyReminders', 'bibleDesc', 'Daily scripture reading reminder') },
    book:       { name: t('dailyReminders', 'bookName', 'Book Summary'),       description: t('dailyReminders', 'bookDesc', 'Christian book summary of the day') },
    prayer:     { name: t('dailyReminders', 'prayerName', 'Prayer Challenge'), description: t('dailyReminders', 'prayerDesc', 'Daily prayer challenge reminder') },
    devotional: { name: t('dailyReminders', 'devotionalName', 'Daily Devotional'), description: t('dailyReminders', 'devotionalDesc', 'Morning devotional reminder') },
    memory:     { name: t('dailyReminders', 'memoryName', 'Scripture Memory'), description: t('dailyReminders', 'memoryDesc', 'Verse memorization practice') },
  };

  // Load reminders — DB first, localStorage fallback
  useEffect(() => {
    const load = async () => {
      try {
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('daily_reminders')
            .eq('user_id', user.id)
            .single();
          if (data?.daily_reminders) {
            // Merge saved enabled/time values back onto default structure (preserves icons/colors)
            const saved: { id: string; enabled: boolean; time: string }[] = data.daily_reminders;
            setReminders(defaultReminders.map(r => {
              const found = saved.find(s => s.id === r.id);
              return found ? { ...r, enabled: found.enabled, time: found.time } : r;
            }));
            return;
          }
        }
        const stored = localStorage.getItem('dailyReminders');
        if (stored) {
          const saved = JSON.parse(stored);
          setReminders(defaultReminders.map(r => {
            const found = saved.find((s: any) => s.id === r.id);
            return found ? { ...r, enabled: found.enabled, time: found.time } : r;
          }));
        }
      } catch {}
    };
    load();
  }, [user]);

  const toggleReminder  = (id: string) => setReminders(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const updateTime      = (id: string, time: string) => setReminders(prev => prev.map(r => r.id === id ? { ...r, time } : r));

  const saveReminders = async () => {
    // Only persist id, enabled, time — icons and colors are static defaults
    const payload = reminders.map(({ id, enabled, time }) => ({ id, enabled, time }));
    localStorage.setItem('dailyReminders', JSON.stringify(payload));
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ daily_reminders: payload })
        .eq('user_id', user.id);
    }
    toast({ title: t('dailyReminders', 'savedTitle', 'Reminders Saved!'), description: t('dailyReminders', 'savedDesc', 'Your daily reminder preferences have been updated.') });
  };

  return (
    <Card className="border-purple-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-purple-600" />{t('dailyReminders', 'title', 'Daily Reminders')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reminders.map(reminder => (
          <div key={reminder.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <reminder.icon className={`h-5 w-5 ${reminder.color}`} />
              <div>
                <p className="font-medium text-sm">{reminderLabels[reminder.id]?.name ?? reminder.name}</p>
                <p className="text-xs text-gray-500">{reminderLabels[reminder.id]?.description ?? reminder.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="time" value={reminder.time} onChange={e => updateTime(reminder.id, e.target.value)} className="text-xs border rounded px-2 py-1" disabled={!reminder.enabled} />
              <Switch checked={reminder.enabled} onCheckedChange={() => toggleReminder(reminder.id)} />
            </div>
          </div>
        ))}
        <Button onClick={saveReminders} className="w-full bg-purple-600 hover:bg-purple-700"><Save className="h-4 w-4 mr-2" />{t('dailyReminders', 'savePreferences', 'Save Preferences')}</Button>
      </CardContent>
    </Card>
  );
};
