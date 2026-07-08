import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Calendar, Plus, Edit, Trash2, Search, Loader2, MapPin, Video, Users,
  Clock, Eye, Play, RefreshCw, Bell, Download, X, CheckCircle,
  PlayCircle, Radio, Film, User, Mail, Send, Link2, AlertCircle, Copy
} from 'lucide-react';

interface MinistryEventsManagerProps {
  ministryId: string;
}

interface Event {
  id: string;
  title: string;
  description: string;
  event_type: string;
  location: string;
  virtual_link: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  recurrence_pattern: string;
  recurrence_rule: string;
  is_live: boolean;
  is_interactive: boolean;
  subscription_required: number;
  max_attendees: number;
  registration_required: boolean;
  send_reminders: boolean;
  reminder_times: number[];
  replay_url: string;
  featured_image: string;
  status: string;
  created_at: string;
}

interface Registration {
  id: string;
  event_id: string;
  user_id: string;
  status: string;
  registered_at: string;
  attended: boolean;
  user_email: string;
  user_name: string;
}

const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' }
];

const REMINDER_OPTIONS = [
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
  { value: 10080, label: '1 week before' }
];

export const MinistryEventsManager: React.FC<MinistryEventsManagerProps> = ({
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<Record<string, number>>({});
  const [allRegistrations, setAllRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showRegistrationsModal, setShowRegistrationsModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'physical',
    location: '',
    virtual_link: '',
    start_time: '',
    end_time: '',
    is_recurring: false,
    recurrence_pattern: 'weekly',
    recurrence_rule: '',
    is_interactive: false,
    subscription_required: 1,
    max_attendees: 0,
    registration_required: false,
    send_reminders: false,
    reminder_times: [1440] as number[],
    replay_url: '',
    featured_image: '',
    status: 'scheduled'
  });

  const [reminderMessage, setReminderMessage] = useState('');

  useEffect(() => {
    loadEvents();
  }, [ministryId]);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_events')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('start_time', { ascending: false });

      if (error) throw error;
      setEvents(data || []);

      // Load registration counts
      const eventIds = (data || []).map(e => e.id);
      if (eventIds.length > 0) {
        const { data: regData } = await supabase
          .from('ministry_event_registrations')
          .select('event_id, status')
          .in('event_id', eventIds);

        const counts: Record<string, number> = {};
        regData?.forEach(r => {
          if (r.status === 'confirmed') {
            counts[r.event_id] = (counts[r.event_id] || 0) + 1;
          }
        });
        setRegistrations(counts);
      }
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEventRegistrations = async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from('ministry_event_registrations')
        .select(`
          *,
          user:profiles(full_name, email)
        `)
        .eq('event_id', eventId)
        .order('registered_at', { ascending: false });

      if (error) throw error;

      const formattedRegs = (data || []).map((r: any) => ({
        ...r,
        user_name: r.user?.full_name || 'Unknown',
        user_email: r.user?.email || ''
      }));

      setAllRegistrations(formattedRegs);
    } catch (err) {
      console.error('Error loading registrations:', err);
    }
  };

  const handleCreate = () => {
    setEditingEvent(null);
    setFormData({
      title: '',
      description: '',
      event_type: 'physical',
      location: '',
      virtual_link: '',
      start_time: '',
      end_time: '',
      is_recurring: false,
      recurrence_pattern: 'weekly',
      recurrence_rule: '',
      is_interactive: false,
      subscription_required: 1,
      max_attendees: 0,
      registration_required: false,
      send_reminders: false,
      reminder_times: [1440],
      replay_url: '',
      featured_image: '',
      status: 'scheduled'
    });
    setShowModal(true);
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      event_type: event.event_type || 'physical',
      location: event.location || '',
      virtual_link: event.virtual_link || '',
      start_time: event.start_time ? new Date(event.start_time).toISOString().slice(0, 16) : '',
      end_time: event.end_time ? new Date(event.end_time).toISOString().slice(0, 16) : '',
      is_recurring: event.is_recurring || false,
      recurrence_pattern: event.recurrence_pattern || 'weekly',
      recurrence_rule: event.recurrence_rule || '',
      is_interactive: event.is_interactive || false,
      subscription_required: event.subscription_required || 1,
      max_attendees: event.max_attendees || 0,
      registration_required: event.registration_required || false,
      send_reminders: event.send_reminders || false,
      reminder_times: event.reminder_times || [1440],
      replay_url: event.replay_url || '',
      featured_image: event.featured_image || '',
      status: event.status || 'scheduled'
    });
    setShowModal(true);
  };

  const handleDuplicate = (event: Event) => {
    setEditingEvent(null);
    setFormData({
      title: `${event.title} (Copy)`,
      description: event.description || '',
      event_type: event.event_type || 'physical',
      location: event.location || '',
      virtual_link: event.virtual_link || '',
      start_time: '',
      end_time: '',
      is_recurring: event.is_recurring || false,
      recurrence_pattern: event.recurrence_pattern || 'weekly',
      recurrence_rule: event.recurrence_rule || '',
      is_interactive: event.is_interactive || false,
      subscription_required: event.subscription_required || 1,
      max_attendees: event.max_attendees || 0,
      registration_required: event.registration_required || false,
      send_reminders: event.send_reminders || false,
      reminder_times: event.reminder_times || [1440],
      replay_url: '',
      featured_image: event.featured_image || '',
      status: 'scheduled'
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.start_time) {
      toast({ title: t('ministryEventsManager', 'error', 'Error'), description: t('ministryEventsManager', 'titleStartRequired', 'Title and start time are required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ministry_id: ministryId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        event_type: formData.event_type,
        location: formData.location,
        virtual_link: formData.virtual_link,
        start_time: formData.start_time,
        end_time: formData.end_time || null,
        is_recurring: formData.is_recurring,
        recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : null,
        recurrence_rule: formData.recurrence_rule,
        is_interactive: formData.is_interactive,
        subscription_required: formData.subscription_required,
        max_attendees: formData.max_attendees || null,
        registration_required: formData.registration_required,
        send_reminders: formData.send_reminders,
        reminder_times: formData.send_reminders ? formData.reminder_times : [],
        replay_url: formData.replay_url,
        featured_image: formData.featured_image,
        status: formData.status,
        created_by: user?.id
      };

      if (editingEvent) {
        const { error } = await supabase
          .from('ministry_events')
          .update(dataToSave)
          .eq('id', editingEvent.id);
        if (error) throw error;
        toast({ title: t('ministryEventsManager', 'success', 'Success'), description: t('ministryEventsManager', 'eventUpdated', 'Event updated successfully') });
      } else {
        const { error } = await supabase
          .from('ministry_events')
          .insert(dataToSave);
        if (error) throw error;
        toast({ title: t('ministryEventsManager', 'success', 'Success'), description: t('ministryEventsManager', 'eventCreated', 'Event created successfully') });
      }

      setShowModal(false);
      loadEvents();
    } catch (err: any) {
      toast({ title: t('ministryEventsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('ministryEventsManager', 'confirmDelete', 'Are you sure you want to delete this event?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_events')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: t('ministryEventsManager', 'success', 'Success'), description: t('ministryEventsManager', 'eventDeleted', 'Event deleted') });
      loadEvents();
    } catch (err: any) {
      toast({ title: t('ministryEventsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleLive = async (event: Event) => {
    try {
      const { error } = await supabase
        .from('ministry_events')
        .update({ 
          is_live: !event.is_live,
          status: !event.is_live ? 'live' : 'scheduled'
        })
        .eq('id', event.id);
      if (error) throw error;

      // Notify registered members when a session goes live
      if (!event.is_live) {
        notify({
          type: 'live_session_starting',
          title: t('ministryEventsManager', 'liveSessionStartingTitle', '🔴 Live Session Starting Now'),
          body: t('ministryEventsManager', 'liveSessionStartingBody', '"{title}" is now live. Join in!').replace('{title}', String(event.title)),
          ministryId: event.ministry_id,
          link: `/events/${event.id}`,
        });
      }

      toast({
        title: t('ministryEventsManager', 'success', 'Success'),
        description: !event.is_live ? t('ministryEventsManager', 'eventNowLive', 'Event is now live!') : t('ministryEventsManager', 'liveSessionEnded', 'Live session ended')
      });
      loadEvents();
    } catch (err: any) {
      toast({ title: t('ministryEventsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleViewRegistrations = async (event: Event) => {
    setSelectedEvent(event);
    await loadEventRegistrations(event.id);
    setShowRegistrationsModal(true);
  };

  const handleSendReminder = async () => {
    if (!selectedEvent || !reminderMessage.trim()) {
      toast({ title: t('ministryEventsManager', 'error', 'Error'), description: t('ministryEventsManager', 'enterReminderMessage', 'Please enter a reminder message'), variant: 'destructive' });
      return;
    }

    setSendingReminder(true);
    try {
      // Get all confirmed registrations
      const { data: regs } = await supabase
        .from('ministry_event_registrations')
        .select('user_id')
        .eq('event_id', selectedEvent.id)
        .eq('status', 'confirmed');

      if (!regs || regs.length === 0) {
        toast({ title: t('ministryEventsManager', 'note', 'Note'), description: t('ministryEventsManager', 'noConfirmedRegistrations', 'No confirmed registrations to send reminders to') });
        return;
      }

      // Use notify() — push for 1hr reminders, push + email for 24hr,
      // determined by the caller selecting the reminder type
      const isNearReminder = reminderMessage.toLowerCase().includes('1 hour') ||
                             reminderMessage.toLowerCase().includes('starting soon');
      const notifType = isNearReminder ? 'event_reminder_1hr' : 'event_reminder_24hr';

      await notify({
        type: notifType,
        title: t('ministryEventsManager', 'reminderTitleX', 'Reminder: {title}').replace('{title}', String(selectedEvent.title)),
        body: reminderMessage,
        // Notify each registered user individually for proper in-app rows
        userId: undefined, // handled per-user below
        ministryId: selectedEvent.ministry_id,
        link: `/events/${selectedEvent.id}`,
      });

      // Also write individual in-app rows for each registrant
      await supabase.from('notifications').insert(
        regs.map(r => ({
          user_id:  r.user_id,
          type:     notifType,
          title:    t('ministryEventsManager', 'reminderTitleX', 'Reminder: {title}').replace('{title}', String(selectedEvent.title)),
          message:  reminderMessage,
          link:     `/events/${selectedEvent.id}`,
          is_read:  false,
          created_at: new Date().toISOString(),
        }))
      );

      toast({
        title: t('ministryEventsManager', 'success', 'Success'),
        description: (regs.length > 1
          ? t('ministryEventsManager', 'reminderSentPlural', 'Reminder sent to {count} participants')
          : t('ministryEventsManager', 'reminderSentSingular', 'Reminder sent to {count} participant')
        ).replace('{count}', String(regs.length))
      });
      setShowReminderModal(false);
      setReminderMessage('');
    } catch (err: any) {
      toast({ title: t('ministryEventsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSendingReminder(false);
    }
  };

  const handleMarkAttended = async (registrationId: string, attended: boolean) => {
    try {
      const { error } = await supabase
        .from('ministry_event_registrations')
        .update({ attended })
        .eq('id', registrationId);

      if (error) throw error;
      if (selectedEvent) {
        await loadEventRegistrations(selectedEvent.id);
      }
    } catch (err: any) {
      toast({ title: t('ministryEventsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleExportRegistrations = () => {
    if (allRegistrations.length === 0) return;

    const csv = [
      ['Name', 'Email', 'Status', 'Registered At', 'Attended'],
      ...allRegistrations.map(r => [
        r.user_name,
        r.user_email,
        r.status,
        new Date(r.registered_at).toLocaleString(),
        r.attended ? 'Yes' : 'No'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedEvent?.title || 'event'}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleReminderTime = (minutes: number) => {
    const current = formData.reminder_times || [];
    if (current.includes(minutes)) {
      setFormData({ 
        ...formData, 
        reminder_times: current.filter(m => m !== minutes)
      });
    } else {
      setFormData({ 
        ...formData, 
        reminder_times: [...current, minutes].sort((a, b) => b - a)
      });
    }
  };

  const getRecurrenceDescription = (pattern: string) => {
    switch (pattern) {
      case 'daily': return t('ministryEventsManager', 'repeatsDaily', 'Repeats every day');
      case 'weekly': return t('ministryEventsManager', 'repeatsWeekly', 'Repeats every week');
      case 'biweekly': return t('ministryEventsManager', 'repeatsBiweekly', 'Repeats every 2 weeks');
      case 'monthly': return t('ministryEventsManager', 'repeatsMonthly', 'Repeats every month');
      case 'custom': return t('ministryEventsManager', 'customRecurrence', 'Custom recurrence');
      default: return '';
    }
  };

  const filteredEvents = events.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.description && e.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = statusFilter === 'all' ||
      (statusFilter === 'upcoming' && new Date(e.start_time) > new Date() && e.status !== 'cancelled') ||
      (statusFilter === 'live' && e.is_live) ||
      (statusFilter === 'past' && new Date(e.start_time) < new Date() && !e.is_live) ||
      (statusFilter === 'cancelled' && e.status === 'cancelled');
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: events.length,
    upcoming: events.filter(e => new Date(e.start_time) > new Date() && e.status !== 'cancelled').length,
    live: events.filter(e => e.is_live).length,
    past: events.filter(e => new Date(e.start_time) < new Date() && !e.is_live).length,
    totalRegistrations: Object.values(registrations).reduce((sum, count) => sum + count, 0)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('ministryEventsManager', 'searchEventsPlaceholder', 'Search events...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-80"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryEventsManager', 'filterAllEvents', 'All Events')}</SelectItem>
              <SelectItem value="upcoming">{t('ministryEventsManager', 'filterUpcoming', 'Upcoming')}</SelectItem>
              <SelectItem value="live">{t('ministryEventsManager', 'filterLiveNow', 'Live Now')}</SelectItem>
              <SelectItem value="past">{t('ministryEventsManager', 'filterPast', 'Past')}</SelectItem>
              <SelectItem value="cancelled">{t('ministryEventsManager', 'filterCancelled', 'Cancelled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('ministryEventsManager', 'createEvent', 'Create Event')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryEventsManager', 'statTotalEvents', 'Total Events')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryEventsManager', 'statUpcoming', 'Upcoming')}</p>
                <p className="text-2xl font-bold">{stats.upcoming}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryEventsManager', 'statLiveNow', 'Live Now')}</p>
                <p className="text-2xl font-bold">{stats.live}</p>
              </div>
              <Radio className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryEventsManager', 'statPastEvents', 'Past Events')}</p>
                <p className="text-2xl font-bold">{stats.past}</p>
              </div>
              <Film className="h-8 w-8 text-gray-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryEventsManager', 'statRegistrations', 'Registrations')}</p>
                <p className="text-2xl font-bold">{stats.totalRegistrations}</p>
              </div>
              <Users className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events List */}
      <Card>
        <CardContent className="p-0">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">{t('ministryEventsManager', 'noEvents', 'No Events')}</h3>
              <p className="text-gray-500 mb-4">{t('ministryEventsManager', 'noEventsSubtitle', 'Start planning your ministry events')}</p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('ministryEventsManager', 'createEvent', 'Create Event')}
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredEvents.map(event => (
                <div key={event.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4 flex-1">
                      {event.featured_image && (
                        <img 
                          src={event.featured_image} 
                          alt={event.title} 
                          className="w-32 h-24 rounded object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{event.title}</h3>
                          {event.is_live && (
                            <Badge className="bg-red-500 animate-pulse">
                              <Radio className="h-3 w-3 mr-1" /> {t('ministryEventsManager', 'badgeLive', 'LIVE')}
                            </Badge>
                          )}
                          {event.is_recurring && (
                            <Badge variant="outline">
                              <RefreshCw className="h-3 w-3 mr-1" /> {t('ministryEventsManager', 'badgeRecurring', 'Recurring')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{event.description}</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <Badge variant={
                            event.event_type === 'virtual' ? 'default' :
                            event.event_type === 'hybrid' ? 'secondary' : 'outline'
                          }>
                            {event.event_type === 'virtual' && <Video className="h-3 w-3 mr-1" />}
                            {event.event_type === 'physical' && <MapPin className="h-3 w-3 mr-1" />}
                            {event.event_type}
                          </Badge>
                          {event.registration_required && (
                            <Badge variant="outline">
                              <Users className="h-3 w-3 mr-1" /> {t('ministryEventsManager', 'badgeRegistrationRequired', 'Registration Required')}
                            </Badge>
                          )}
                          {event.send_reminders && (
                            <Badge variant="outline">
                              <Bell className="h-3 w-3 mr-1" /> {t('ministryEventsManager', 'badgeReminders', 'Reminders')}
                            </Badge>
                          )}
                          {event.replay_url && (
                            <Badge variant="outline">
                              <PlayCircle className="h-3 w-3 mr-1" /> {t('ministryEventsManager', 'badgeReplayAvailable', 'Replay Available')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(event.start_time).toLocaleString()}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {t('ministryEventsManager', 'xRegistered', '{count} registered').replace('{count}', String(registrations[event.id] || 0))}
                            {event.max_attendees > 0 && ` / ${event.max_attendees}`}
                          </span>
                          <Badge variant={
                            event.status === 'live' ? 'destructive' :
                            event.status === 'completed' ? 'secondary' :
                            event.status === 'cancelled' ? 'outline' : 'default'
                          }>
                            {event.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {event.event_type !== 'physical' && new Date(event.start_time) <= new Date() && (
                        <Button
                          variant={event.is_live ? 'destructive' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleLive(event)}
                        >
                          {event.is_live ? (
                            <><Radio className="h-4 w-4 mr-1 animate-pulse" /> {t('ministryEventsManager', 'endLive', 'End Live')}</>
                          ) : (
                            <><Play className="h-4 w-4 mr-1" /> {t('ministryEventsManager', 'goLive', 'Go Live')}</>
                          )}
                        </Button>
                      )}
                      {event.registration_required && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewRegistrations(event)}
                        >
                          <Users className="h-4 w-4 mr-1" />
                          {registrations[event.id] || 0}
                        </Button>
                      )}
                      {event.send_reminders && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedEvent(event);
                            setReminderMessage(t('ministryEventsManager', 'reminderDefaultMessage', 'Reminder: {title} starts at {time}').replace('{title}', String(event.title)).replace('{time}', new Date(event.start_time).toLocaleString()));
                            setShowReminderModal(true);
                          }}
                        >
                          <Bell className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(event)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(event)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Event Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? t('ministryEventsManager', 'editEvent', 'Edit Event') : t('ministryEventsManager', 'createEvent', 'Create Event')}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">{t('ministryEventsManager', 'tabBasicInfo', 'Basic Info')}</TabsTrigger>
              <TabsTrigger value="schedule">{t('ministryEventsManager', 'tabScheduleRecurrence', 'Schedule & Recurrence')}</TabsTrigger>
              <TabsTrigger value="settings">{t('ministryEventsManager', 'tabSettings', 'Settings')}</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div>
                <Label>{t('ministryEventsManager', 'labelTitle', 'Title *')}</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('ministryEventsManager', 'placeholderEventTitle', 'Event title')}
                />
              </div>

              <div>
                <Label>{t('ministryEventsManager', 'labelDescription', 'Description')}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('ministryEventsManager', 'placeholderEventDescription', 'Event description...')}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('ministryEventsManager', 'labelEventType', 'Event Type')}</Label>
                  <Select
                    value={formData.event_type}
                    onValueChange={(v) => setFormData({ ...formData, event_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">{t('ministryEventsManager', 'eventTypePhysical', 'Physical')}</SelectItem>
                      <SelectItem value="virtual">{t('ministryEventsManager', 'eventTypeVirtual', 'Virtual')}</SelectItem>
                      <SelectItem value="hybrid">{t('ministryEventsManager', 'eventTypeHybrid', 'Hybrid')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('ministryEventsManager', 'labelStatus', 'Status')}</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v) => setFormData({ ...formData, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{t('ministryEventsManager', 'statusDraft', 'Draft')}</SelectItem>
                      <SelectItem value="scheduled">{t('ministryEventsManager', 'statusScheduled', 'Scheduled')}</SelectItem>
                      <SelectItem value="live">{t('ministryEventsManager', 'statusLive', 'Live')}</SelectItem>
                      <SelectItem value="completed">{t('ministryEventsManager', 'statusCompleted', 'Completed')}</SelectItem>
                      <SelectItem value="cancelled">{t('ministryEventsManager', 'statusCancelled', 'Cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(formData.event_type === 'physical' || formData.event_type === 'hybrid') && (
                <div>
                  <Label>{t('ministryEventsManager', 'labelLocation', 'Location')}</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder={t('ministryEventsManager', 'placeholderPhysicalLocation', 'Physical location')}
                  />
                </div>
              )}

              {(formData.event_type === 'virtual' || formData.event_type === 'hybrid') && (
                <div>
                  <Label>{t('ministryEventsManager', 'labelVirtualLink', 'Virtual Link')}</Label>
                  <Input
                    value={formData.virtual_link}
                    onChange={(e) => setFormData({ ...formData, virtual_link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              )}

              <div>
                <Label>{t('ministryEventsManager', 'labelFeaturedImage', 'Featured Image URL (Optional)')}</Label>
                <Input
                  value={formData.featured_image}
                  onChange={(e) => setFormData({ ...formData, featured_image: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('ministryEventsManager', 'labelStartTime', 'Start Time *')}</Label>
                  <Input
                    type="datetime-local"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('ministryEventsManager', 'labelEndTime', 'End Time')}</Label>
                  <Input
                    type="datetime-local"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.is_recurring}
                  onCheckedChange={(v) => setFormData({ ...formData, is_recurring: v })}
                />
                <Label>{t('ministryEventsManager', 'labelRecurringEvent', 'Recurring Event')}</Label>
              </div>

              {formData.is_recurring && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div>
                    <Label>{t('ministryEventsManager', 'labelRecurrencePattern', 'Recurrence Pattern')}</Label>
                    <Select
                      value={formData.recurrence_pattern}
                      onValueChange={(v) => setFormData({ ...formData, recurrence_pattern: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_PATTERNS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{t('ministryEventsManager', `recurrence_${p.value}`, p.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      {getRecurrenceDescription(formData.recurrence_pattern)}
                    </p>
                  </div>

                  {formData.recurrence_pattern === 'custom' && (
                    <div>
                      <Label>{t('ministryEventsManager', 'labelCustomRecurrenceRule', 'Custom Recurrence Rule')}</Label>
                      <Input
                        value={formData.recurrence_rule}
                        onChange={(e) => setFormData({ ...formData, recurrence_rule: e.target.value })}
                        placeholder={t('ministryEventsManager', 'placeholderCustomRule', 'e.g., Every 3rd Monday of the month')}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {t('ministryEventsManager', 'customRuleHint', 'Describe the custom recurrence pattern')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('ministryEventsManager', 'labelMaxAttendees', 'Max Attendees (0 = unlimited)')}</Label>
                  <Input
                    type="number"
                    value={formData.max_attendees}
                    onChange={(e) => setFormData({ ...formData, max_attendees: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>{t('ministryEventsManager', 'labelSubscriptionLevel', 'Subscription Level Required')}</Label>
                  <Select
                    value={formData.subscription_required.toString()}
                    onValueChange={(v) => setFormData({ ...formData, subscription_required: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('ministryEventsManager', 'subFreeAllMembers', 'Free (All Members)')}</SelectItem>
                      <SelectItem value="2">{t('ministryEventsManager', 'subPremiumMembers', 'Premium Members')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t('ministryEventsManager', 'labelReplayUrl', 'Replay URL (for completed events)')}</Label>
                <Input
                  value={formData.replay_url}
                  onChange={(e) => setFormData({ ...formData, replay_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Switch
                    checked={formData.registration_required}
                    onCheckedChange={(v) => setFormData({ ...formData, registration_required: v })}
                  />
                  <Label>{t('ministryEventsManager', 'labelRegistrationRequired', 'Registration Required')}</Label>
                </div>

                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Switch
                    checked={formData.is_interactive}
                    onCheckedChange={(v) => setFormData({ ...formData, is_interactive: v })}
                  />
                  <Label>{t('ministryEventsManager', 'labelInteractive', 'Interactive (Premium Feature)')}</Label>
                </div>

                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Switch
                    checked={formData.send_reminders}
                    onCheckedChange={(v) => setFormData({ ...formData, send_reminders: v })}
                  />
                  <Label>{t('ministryEventsManager', 'labelSendAutoReminders', 'Send Automatic Reminders')}</Label>
                </div>

                {formData.send_reminders && (
                  <div className="p-4 border rounded-lg space-y-2">
                    <Label>{t('ministryEventsManager', 'labelReminderTimes', 'Reminder Times')}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {REMINDER_OPTIONS.map(option => (
                        <div 
                          key={option.value}
                          className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${
                            formData.reminder_times.includes(option.value) 
                              ? 'bg-purple-50 border-purple-300' 
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => toggleReminderTime(option.value)}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            formData.reminder_times.includes(option.value) 
                              ? 'bg-purple-600 border-purple-600' 
                              : 'border-gray-300'
                          }`}>
                            {formData.reminder_times.includes(option.value) && (
                              <CheckCircle className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <span className="text-sm">{t('ministryEventsManager', `reminderOption_${option.value}`, option.label)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('ministryEventsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingEvent ? t('ministryEventsManager', 'updateEvent', 'Update Event') : t('ministryEventsManager', 'createEvent', 'Create Event')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrations Modal */}
      <Dialog open={showRegistrationsModal} onOpenChange={setShowRegistrationsModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {t('ministryEventsManager', 'eventRegistrationsX', 'Event Registrations: {title}').replace('{title}', String(selectedEvent?.title ?? ''))}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <span className="font-semibold">{allRegistrations.filter(r => r.status === 'confirmed').length}</span> {t('ministryEventsManager', 'confirmedCount', 'Confirmed')}
                </div>
                <div className="text-sm">
                  <span className="font-semibold">{allRegistrations.filter(r => r.attended).length}</span> {t('ministryEventsManager', 'attendedCount', 'Attended')}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportRegistrations}>
                <Download className="h-4 w-4 mr-2" />
                {t('ministryEventsManager', 'exportCsv', 'Export CSV')}
              </Button>
            </div>

            {allRegistrations.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">{t('ministryEventsManager', 'noRegistrationsYet', 'No registrations yet')}</p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                {allRegistrations.map(reg => (
                  <div key={reg.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3 flex-1">
                      <User className="h-8 w-8 text-gray-400" />
                      <div>
                        <p className="font-medium">{reg.user_name}</p>
                        <p className="text-sm text-gray-500">{reg.user_email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={reg.status === 'confirmed' ? 'default' : 'secondary'}>
                        {reg.status}
                      </Badge>
                      <Button
                        variant={reg.attended ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleMarkAttended(reg.id, !reg.attended)}
                      >
                        {reg.attended ? (
                          <><CheckCircle className="h-4 w-4 mr-1" /> {t('ministryEventsManager', 'attended', 'Attended')}</>
                        ) : (
                          <>{t('ministryEventsManager', 'markAttended', 'Mark Attended')}</>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRegistrationsModal(false)}>{t('ministryEventsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Reminder Modal */}
      <Dialog open={showReminderModal} onOpenChange={setShowReminderModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ministryEventsManager', 'sendEventReminder', 'Send Event Reminder')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryEventsManager', 'labelReminderMessage', 'Reminder Message')}</Label>
              <Textarea
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                placeholder={t('ministryEventsManager', 'placeholderReminderMessage', 'Enter reminder message...')}
                rows={4}
              />
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">{t('ministryEventsManager', 'reminderWillBeSentTo', 'This reminder will be sent to:')}</p>
                  <p>{t('ministryEventsManager', 'xConfirmedRegistrants', '{count} confirmed registrants').replace('{count}', String(registrations[selectedEvent?.id || ''] || 0))}</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReminderModal(false)}>{t('ministryEventsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSendReminder} disabled={sendingReminder}>
              {sendingReminder ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('ministryEventsManager', 'sending', 'Sending...')}</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> {t('ministryEventsManager', 'sendReminder', 'Send Reminder')}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default MinistryEventsManager;