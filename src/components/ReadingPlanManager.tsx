import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Calendar, Plus, Edit, Trash2, BookOpen, Clock, Target, 
  Save, X, ChevronDown, ChevronUp, AlertCircle 
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface DayReading {
  day: number;
  passages: string[];
}

interface ReadingPlan {
  id: string;
  name: string;
  title: string;
  totalDays: number;
  description: string;
  category: string;
  duration: string;
  readings: DayReading[];
}

const categories = [
  'Overview',
  'Devotional',
  'Wisdom',
  'Gospel',
  'Epistle',
  'Old Testament',
  'New Testament',
  'Prophets',
  'Custom'
];

export const ReadingPlanManager: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [readingPlans, setReadingPlans] = useState<ReadingPlan[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ReadingPlan | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(false);
  
  const [formData, setFormData] = useState<Partial<ReadingPlan>>({
    name: '',
    title: '',
    description: '',
    category: 'Custom',
    duration: '',
    totalDays: 0,
    readings: []
  });
  
  const [currentReading, setCurrentReading] = useState({
    day: 1,
    passages: ['']
  });

  useEffect(() => {
    // Check if storage API is available
    const checkStorage = () => {
      try {
        // Check for window.storage API
        if (window.storage && typeof window.storage.get === 'function') {
          setStorageAvailable(true);
        } else {
          console.warn('window.storage API not available, using localStorage as fallback');
          setStorageAvailable(false);
        }
      } catch (error) {
        console.warn('Storage check failed:', error);
        setStorageAvailable(false);
      }
    };
    
    checkStorage();
    loadReadingPlans();
  }, []);

  const loadReadingPlans = async () => {
    try {
      if (user) {
        const { data } = await supabase
          .from('user_reading_plans')
          .select('id, plan_data')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (data && data.length > 0) {
          setReadingPlans(data.map(r => ({ ...r.plan_data, _db_id: r.id })));
          return;
        }
      }
      // Fallback to localStorage
      const stored = localStorage.getItem('custom-reading-plans');
      if (stored) setReadingPlans(JSON.parse(stored));
    } catch (error) {
      console.error('Error loading reading plans:', error);
      const stored = localStorage.getItem('custom-reading-plans');
      if (stored) setReadingPlans(JSON.parse(stored));
    }
  };

  const saveReadingPlans = async (plans: ReadingPlan[]) => {
    try {
      // localStorage as fallback cache
      localStorage.setItem('custom-reading-plans', JSON.stringify(plans));

      if (user) {
        // Upsert each plan individually keyed by plan.id
        for (const plan of plans) {
          await supabase
            .from('user_reading_plans')
            .upsert(
              { user_id: user.id, plan_id: plan.id, plan_data: plan, updated_at: new Date().toISOString() },
              { onConflict: 'user_id,plan_id' }
            );
        }
      }

      toast({
        title: t('readingPlanManager', 'success', 'Success'),
        description: t('readingPlanManager', 'plansSaved', 'Reading plans saved successfully')
      });
    } catch (error) {
      console.error('Error saving reading plans:', error);
      toast({
        title: t('readingPlanManager', 'error', 'Error'),
        description: t('readingPlanManager', 'plansSaveFailed', 'Failed to save reading plans'),
        variant: 'destructive'
      });
    }
  };

  const handleCreate = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      title: '',
      description: '',
      category: 'Custom',
      duration: '',
      totalDays: 0,
      readings: []
    });
    setCurrentReading({ day: 1, passages: [''] });
    setShowModal(true);
  };

  const handleEdit = (plan: ReadingPlan) => {
    setEditingPlan(plan);
    setFormData(plan);
    setCurrentReading({ 
      day: plan.readings.length + 1, 
      passages: [''] 
    });
    setShowModal(true);
  };

  const handleDelete = async (planId: string) => {
    if (!confirm(t('readingPlanManager', 'confirmDelete', 'Are you sure you want to delete this reading plan?'))) return;

    const updatedPlans = readingPlans.filter(p => p.id !== planId);
    setReadingPlans(updatedPlans);
    await saveReadingPlans(updatedPlans);
    toast({ title: t('readingPlanManager', 'success', 'Success'), description: t('readingPlanManager', 'planDeleted', 'Reading plan deleted') });
  };

  const addReading = () => {
    if (!currentReading.passages[0]) {
      toast({
        title: t('readingPlanManager', 'error', 'Error'),
        description: t('readingPlanManager', 'enterPassage', 'Please enter at least one passage'),
        variant: 'destructive'
      });
      return;
    }

    const newReadings = [
      ...(formData.readings || []),
      {
        day: currentReading.day,
        passages: currentReading.passages.filter(p => p.trim())
      }
    ];

    setFormData({
      ...formData,
      readings: newReadings,
      totalDays: newReadings.length
    });

    setCurrentReading({
      day: currentReading.day + 1,
      passages: ['']
    });

    toast({
      title: t('readingPlanManager', 'added', 'Added'),
      description: t('readingPlanManager', 'dayReadingAdded', 'Day {day} reading added successfully').replace('{day}', String(currentReading.day))
    });
  };

  const removeReading = (day: number) => {
    const updatedReadings = (formData.readings || [])
      .filter(r => r.day !== day)
      .map((r, idx) => ({ ...r, day: idx + 1 }));

    setFormData({
      ...formData,
      readings: updatedReadings,
      totalDays: updatedReadings.length
    });

    setCurrentReading({
      ...currentReading,
      day: updatedReadings.length + 1
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.description || !formData.category) {
      toast({
        title: t('readingPlanManager', 'error', 'Error'),
        description: t('readingPlanManager', 'fillRequired', 'Please fill in all required fields'),
        variant: 'destructive'
      });
      return;
    }

    if (!formData.readings || formData.readings.length === 0) {
      toast({
        title: t('readingPlanManager', 'error', 'Error'),
        description: t('readingPlanManager', 'addOneDay', 'Please add at least one day of readings'),
        variant: 'destructive'
      });
      return;
    }

    const planToSave: ReadingPlan = {
      id: editingPlan?.id || `plan-${Date.now()}`,
      name: formData.name!,
      title: formData.title || formData.name!,
      description: formData.description!,
      category: formData.category!,
      duration: formData.duration || `${formData.readings!.length} days`,
      totalDays: formData.readings!.length,
      readings: formData.readings!
    };

    let updatedPlans: ReadingPlan[];
    if (editingPlan) {
      updatedPlans = readingPlans.map(p => p.id === editingPlan.id ? planToSave : p);
    } else {
      updatedPlans = [...readingPlans, planToSave];
    }

    setReadingPlans(updatedPlans);
    await saveReadingPlans(updatedPlans);
    setShowModal(false);
    setFormData({});
    setCurrentReading({ day: 1, passages: [''] });
  };

  const updatePassage = (index: number, value: string) => {
    const newPassages = [...currentReading.passages];
    newPassages[index] = value;
    setCurrentReading({ ...currentReading, passages: newPassages });
  };

  const addPassageField = () => {
    setCurrentReading({
      ...currentReading,
      passages: [...currentReading.passages, '']
    });
  };

  const removePassageField = (index: number) => {
    const newPassages = currentReading.passages.filter((_, i) => i !== index);
    setCurrentReading({ ...currentReading, passages: newPassages });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-6 w-6 text-purple-600" />
                {t('readingPlanManager', 'title', 'Reading Plans Manager')}
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {t('readingPlanManager', 'subtitle', 'Create and manage Bible reading plans for your community')}
              </p>
            </div>
            <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 mr-2" />
              {t('readingPlanManager', 'createPlan', 'Create Reading Plan')}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600">{readingPlans.length}</p>
              <p className="text-sm text-gray-500 mt-1">{t('readingPlanManager', 'totalPlans', 'Total Plans')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">
                {readingPlans.reduce((acc, p) => acc + p.totalDays, 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t('readingPlanManager', 'totalDaysLabel', 'Total Days')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">
                {new Set(readingPlans.map(p => p.category)).size}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t('readingPlanManager', 'categories', 'Categories')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {readingPlans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('readingPlanManager', 'noPlansYet', 'No Reading Plans Yet')}</h3>
              <p className="text-gray-500 mb-4">{t('readingPlanManager', 'createFirst', 'Create your first reading plan to get started')}</p>
              <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">
                <Plus className="h-4 w-4 mr-2" />
                {t('readingPlanManager', 'createPlan', 'Create Reading Plan')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          readingPlans.map(plan => {
            const isExpanded = expandedPlan === plan.id;
            
            return (
              <Card key={plan.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{plan.name}</h3>
                        <Badge variant="secondary">{plan.category}</Badge>
                      </div>
                      <p className="text-gray-600 mb-3">{plan.description}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {plan.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="h-4 w-4" />
                          {t('readingPlanManager', 'daysCount', '{count} days').replace('{count}', String(plan.totalDays))}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-4 w-4" />
                          {t('readingPlanManager', 'passagesCount', '{count} passages').replace('{count}', String(plan.readings.reduce((acc, r) => acc + r.passages.length, 0)))}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-medium mb-3">{t('readingPlanManager', 'readingSchedule', 'Reading Schedule')}</h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {plan.readings.map(reading => (
                          <div key={reading.day} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-medium text-sm">
                              {reading.day}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{t('readingPlanManager', 'dayN', 'Day {day}').replace('{day}', String(reading.day))}</p>
                              <p className="text-xs text-gray-600">{reading.passages.join(', ')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? t('readingPlanManager', 'editPlan', 'Edit Reading Plan') : t('readingPlanManager', 'createNewPlan', 'Create New Reading Plan')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-medium text-lg">{t('readingPlanManager', 'basicInfo', 'Basic Information')}</h3>

              <div>
                <Label>{t('readingPlanManager', 'planNameLabel', 'Plan Name *')}</Label>
                <Input
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('readingPlanManager', 'planNamePlaceholder', 'e.g., 30-Day Bible Overview')}
                />
              </div>

              <div>
                <Label>{t('readingPlanManager', 'descriptionLabel', 'Description *')}</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('readingPlanManager', 'descriptionPlaceholder', 'Brief description of this reading plan...')}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('readingPlanManager', 'categoryLabel', 'Category *')}</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t('readingPlanManager', 'durationLabel', 'Duration')}</Label>
                  <Input
                    value={formData.duration || ''}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder={t('readingPlanManager', 'durationPlaceholder', 'e.g., 30 days')}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-lg">{t('readingPlanManager', 'dailyReadings', 'Daily Readings')}</h3>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('readingPlanManager', 'passageFormatHint', 'Add Bible passages for each day. Use format like "Genesis 1", "John 3:16", or "Psalm 23:1-6"')}
                </AlertDescription>
              </Alert>

              {formData.readings && formData.readings.length > 0 && (
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                  <p className="text-sm font-medium mb-2">{t('readingPlanManager', 'addedReadings', 'Added Readings ({count})').replace('{count}', String(formData.readings.length))}</p>
                  <div className="space-y-2">
                    {formData.readings.map(reading => (
                      <div key={reading.day} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium text-sm">{t('readingPlanManager', 'dayNColon', 'Day {day}:').replace('{day}', String(reading.day))}</span>
                          <span className="text-sm text-gray-600 ml-2">{reading.passages.join(', ')}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeReading(reading.day)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border rounded-lg p-4 bg-blue-50">
                <Label className="text-blue-900 mb-3 block">
                  {t('readingPlanManager', 'addDayReading', 'Add Day {day} Reading').replace('{day}', String(currentReading.day))}
                </Label>
                
                <div className="space-y-3">
                  {currentReading.passages.map((passage, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={passage}
                        onChange={(e) => updatePassage(index, e.target.value)}
                        placeholder={t('readingPlanManager', 'passagePlaceholder', 'e.g., Genesis 1 or John 3:16')}
                        className="bg-white"
                      />
                      {currentReading.passages.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removePassageField(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addPassageField}
                      className="flex-1"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('readingPlanManager', 'addAnotherPassage', 'Add Another Passage')}
                    </Button>
                    <Button
                      type="button"
                      onClick={addReading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {t('readingPlanManager', 'addDay', 'Add Day {day}').replace('{day}', String(currentReading.day))}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t('readingPlanManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
              <Save className="h-4 w-4 mr-2" />
              {editingPlan ? t('readingPlanManager', 'updatePlan', 'Update Plan') : t('readingPlanManager', 'createPlanBtn', 'Create Plan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};