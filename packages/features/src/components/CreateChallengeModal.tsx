import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { PrayerPoint, CHALLENGE_CATEGORIES, SESSION_DURATIONS } from '@rekindle/types/prayerTypes';
import { instrumentalTracks } from '../data/instrumentals';
import { getVerseText, sampleVerses } from '../data/bibleVerses';
import { Plus, Trash2, Calendar, Music, BookOpen } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '../LanguageContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (challenge: any) => void;
  userId: string;
  userName: string;
}

const scriptureOptions = Object.keys(sampleVerses);

export const CreateChallengeModal: React.FC<Props> = ({ open, onClose, onCreated, userId, userName }) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Healing');
  const [sessionType, setSessionType] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [instrumentalId, setInstrumentalId] = useState('1');
  const [prayerPoints, setPrayerPoints] = useState<PrayerPoint[]>([{ title: '', content: '', scripture: '', scriptureText: '' }]);
  const [liveDate, setLiveDate] = useState('');
  const [liveDuration, setLiveDuration] = useState(30);
  const [loading, setLoading] = useState(false);

  const addPrayerPoint = () => setPrayerPoints([...prayerPoints, { title: '', content: '', scripture: '', scriptureText: '' }]);
  const removePrayerPoint = (index: number) => setPrayerPoints(prayerPoints.filter((_, i) => i !== index));
  
  const updatePrayerPoint = (index: number, field: keyof PrayerPoint, value: string) => {
    const updated = [...prayerPoints];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-fill scripture text when scripture reference is selected
    if (field === 'scripture' && value) {
      const text = getVerseText(value, 'niv');
      if (text !== 'Verse text not available') {
        updated[index].scriptureText = text;
      }
    }
    
    setPrayerPoints(updated);
  };

  const handleCreate = async () => {
    if (!title || prayerPoints.some(p => !p.title || !p.content)) {
      toast({ title: t('createChallengeModal', 'error', 'Error'), description: t('createChallengeModal', 'fillRequiredFields', 'Please fill in all required fields'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('enhanced_prayer_challenges').insert({
        title, description, category, session_type: sessionType,
        prayer_points: prayerPoints, instrumental_id: instrumentalId,
        creator_id: userId, creator_name: userName,
        live_session_date: liveDate || null, live_session_duration: liveDuration
      }).select().single();
      if (error) throw error;
      toast({ title: t('createChallengeModal', 'success', 'Success'), description: t('createChallengeModal', 'challengeCreated', 'Prayer challenge created!') });
      onCreated(data);
      onClose();
      // Reset form
      setTitle('');
      setDescription('');
      setPrayerPoints([{ title: '', content: '', scripture: '', scriptureText: '' }]);
    } catch (err: any) {
      toast({ title: t('createChallengeModal', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('createChallengeModal', 'createPrayerChallenge', 'Create Prayer Challenge')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input placeholder={t('createChallengeModal', 'challengeTitlePlaceholder', 'Challenge Title *')} value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder={t('createChallengeModal', 'description', 'Description')} value={description} onChange={e => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder={t('createChallengeModal', 'category', 'Category')} /></SelectTrigger>
              <SelectContent>{CHALLENGE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={sessionType} onValueChange={(v: any) => setSessionType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SESSION_DURATIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-purple-600" />
            <Select value={instrumentalId} onValueChange={setInstrumentalId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{instrumentalTracks.map(track => <SelectItem key={track.id} value={track.id}>{track.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-purple-600" />
              {t('createChallengeModal', 'prayerPointsWithScripture', 'Prayer Points (with Scripture)')}
            </h4>
            {prayerPoints.map((point, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex gap-2">
                  <Input placeholder={t('createChallengeModal', 'pointTitlePlaceholder', 'Point Title *')} value={point.title} onChange={e => updatePrayerPoint(i, 'title', e.target.value)} />
                  {prayerPoints.length > 1 && <Button variant="ghost" size="icon" onClick={() => removePrayerPoint(i)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                </div>
                <Textarea placeholder={t('createChallengeModal', 'prayerContentPlaceholder', 'Prayer content *')} value={point.content} onChange={e => updatePrayerPoint(i, 'content', e.target.value)} />
                
                {/* Scripture selector */}
                <div className="space-y-2">
                  <Select value={point.scripture || '__none__'} onValueChange={v => updatePrayerPoint(i, 'scripture', v === '__none__' ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('createChallengeModal', 'selectScriptureReference', 'Select Scripture Reference')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('createChallengeModal', 'noScripture', 'No Scripture')}</SelectItem>
                      {scriptureOptions.map(ref => (
                        <SelectItem key={ref} value={ref}>{ref}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  
                  {/* Or manual entry */}
                  <Input
                    placeholder={t('createChallengeModal', 'customScriptureReference', 'Or enter custom scripture reference')}
                    value={point.scripture || ''}
                    onChange={e => updatePrayerPoint(i, 'scripture', e.target.value)} 
                  />
                  
                  {/* Scripture text display/edit */}
                  {point.scripture && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-xs font-medium text-amber-700 mb-1">{point.scripture}</p>
                      <Textarea 
                        placeholder={t('createChallengeModal', 'scriptureTextPlaceholder', 'Scripture text (auto-filled for common verses)')}
                        value={point.scriptureText || ''}
                        onChange={e => updatePrayerPoint(i, 'scriptureText', e.target.value)}
                        className="text-sm bg-white"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
                
                <Input
                  placeholder={t('createChallengeModal', 'reflectionPromptPlaceholder', 'Reflection prompt (optional)')}
                  value={point.reflection || ''}
                  onChange={e => updatePrayerPoint(i, 'reflection', e.target.value)} 
                />
              </div>
            ))}
            <Button variant="outline" onClick={addPrayerPoint} className="w-full"><Plus className="h-4 w-4 mr-2" />{t('createChallengeModal', 'addPrayerPoint', 'Add Prayer Point')}</Button>
          </div>
          <div className="border-t pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3"><Calendar className="h-4 w-4" />{t('createChallengeModal', 'scheduleLiveSession', 'Schedule Live Session (Optional)')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input type="datetime-local" value={liveDate} onChange={e => setLiveDate(e.target.value)} />
              <Select value={liveDuration.toString()} onValueChange={v => setLiveDuration(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">{t('createChallengeModal', 'minutes15', '15 minutes')}</SelectItem>
                  <SelectItem value="30">{t('createChallengeModal', 'minutes30', '30 minutes')}</SelectItem>
                  <SelectItem value="60">{t('createChallengeModal', 'hour1', '1 hour')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
            {loading ? t('createChallengeModal', 'creating', 'Creating...') : t('createChallengeModal', 'createChallenge', 'Create Challenge')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
