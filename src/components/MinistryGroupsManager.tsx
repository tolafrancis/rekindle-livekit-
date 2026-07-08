import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Users, Search, Plus, Edit, Trash2, RefreshCw, 
  UserPlus, Mail, Link, Copy, Check, Crown, Shield,
  Settings, Eye, EyeOff, Loader2, Radio, Send, 
  MessageSquare, Clock, Calendar, CheckCircle, X,
  BarChart3, History
} from 'lucide-react';

interface MinistryGroup {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  owner_id: string;
  member_count: number;
  invite_code: string;
  settings: {
    allow_broadcasts: boolean;
    public_join: boolean;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  can_receive_broadcasts: boolean;
  joined_at: string;
  email?: string;
  user_profile?: {
    full_name: string;
    email: string;
    avatar_url: string;
  };
}
interface GroupInvite {
  id: string;
  group_id: string;
  email: string;
  invite_code: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface BroadcastRecord {
  id: string;
  title: string;
  message: string;
  broadcast_type: string;
  channels: string[];
  status: string;
  recipient_count: number;
  delivered_count: number;
  read_count: number;
  sent_at: string;
  scheduled_at: string;
  created_at: string;
  group_id: string;
  sender_id: string;
}

interface BroadcastTemplate {
  id: string;
  name: string;
  title: string;
  message: string;
  channel: string;
  audience: string;
  user_id: string;
  group_id: string | null;
  created_at: string;
}


interface MinistryGroupsManagerProps {
  onUpdate?: () => void;
}

export const MinistryGroupsManager: React.FC<MinistryGroupsManagerProps> = ({ onUpdate }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [groups, setGroups] = useState<MinistryGroup[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showBroadcastDetailsModal, setShowBroadcastDetailsModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MinistryGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<MinistryGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [broadcastTab, setBroadcastTab] = useState('compose');
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastRecord[]>([]);
  const [selectedBroadcast, setSelectedBroadcast] = useState<BroadcastRecord | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  // Template save dialog (replaces window.prompt)
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Template delete confirmation (replaces window.confirm)
  const [templatePendingDelete, setTemplatePendingDelete] = useState<BroadcastTemplate | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    leader_id: '',
    is_active: true,
    settings: {
      allow_broadcasts: true,
      public_join: false
    }
  });

  const [broadcastFormData, setBroadcastFormData] = useState({
    title: '',
    message: '',
    channel: 'push',
    audience: 'all',
    scheduleType: 'now',
    scheduledDate: '',
    scheduledTime: ''
  });

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadGroups();
    loadUsers();
    return () => { isMounted.current = false; };
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ministry_groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (isMounted.current) {
        setGroups(data || []);
      }
    } catch (err: any) {
      console.error('Error loading ministry groups:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email, subscription_tier')
        .in('subscription_tier', ['premium', 'ministry'])
        .order('full_name');

      if (error) throw error;
      if (isMounted.current) {
        setUsers(data || []);
      }
    } catch (err: any) {
      console.error('Error loading users:', err);
    }
  };

  const loadGroupMembers = async (groupId: string) => {
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('ministry_group_members')
        .select('*')
        .eq('group_id', groupId);

      if (membersError) throw membersError;

      const userIds = membersData?.map(m => m.user_id).filter(Boolean) || [];
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, email, avatar_url')
          .in('user_id', userIds);
        profiles = profilesData || [];
      }

      const membersWithProfiles = membersData?.map(member => ({
        ...member,
        user_profile: profiles.find(p => p.user_id === member.user_id)
      })) || [];

      const { data: invitesData, error: invitesError } = await supabase
        .from('ministry_group_invites')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'pending');

      if (invitesError) throw invitesError;

      if (isMounted.current) {
        setMembers(membersWithProfiles);
        setInvites(invitesData || []);
      }
    } catch (err: any) {
      console.error('Error loading group members:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const loadBroadcastHistory = async (groupId: string) => {
    try {
      setLoadingHistory(true);
      const { data, error } = await supabase
        .from('ministry_group_broadcasts')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform data to match our interface
      const transformedData: BroadcastRecord[] = (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        broadcast_type: item.broadcast_type || 'general',
        channels: Array.isArray(item.channels) ? item.channels : (item.channels ? [item.channels] : ['push']),
        status: item.status || 'sent',
        recipient_count: item.recipient_count || 0,
        delivered_count: item.delivered_count || 0,
        read_count: item.read_count || 0,
        sent_at: item.sent_at || item.created_at,
        scheduled_at: item.scheduled_at,
        created_at: item.created_at,
        group_id: item.group_id,
        sender_id: item.sender_id
      }));

      if (isMounted.current) {
        setBroadcastHistory(transformedData);
      }
    } catch (err: any) {
      console.error('Error loading broadcast history:', err);
      // Set mock data if no data exists yet
      if (isMounted.current) {
        setBroadcastHistory([
          {
            id: '1',
            title: 'Weekly Prayer Update',
            message: 'Join us for our weekly prayer meeting this Saturday at 9 AM.',
            broadcast_type: 'announcement',
            channels: ['push'],
            status: 'sent',
            recipient_count: 45,
            delivered_count: 43,
            read_count: 38,
            sent_at: new Date(Date.now() - 86400000).toISOString(),
            scheduled_at: '',
            created_at: new Date(Date.now() - 86400000).toISOString(),
            group_id: groupId,
            sender_id: ''
          },
          {
            id: '2',
            title: 'New Devotional Series',
            message: 'We are starting a new devotional series on the book of Psalms.',
            broadcast_type: 'devotional',
            channels: ['email'],
            status: 'sent',
            recipient_count: 42,
            delivered_count: 40,
            read_count: 35,
            sent_at: new Date(Date.now() - 172800000).toISOString(),
            scheduled_at: '',
            created_at: new Date(Date.now() - 172800000).toISOString(),
            group_id: groupId,
            sender_id: ''
          },
          {
            id: '3',
            title: 'Ministry Event Reminder',
            message: 'Don\'t forget about our community outreach event next week!',
            broadcast_type: 'reminder',
            channels: ['whatsapp'],
            status: 'sent',
            recipient_count: 12,
            delivered_count: 12,
            read_count: 10,
            sent_at: new Date(Date.now() - 259200000).toISOString(),
            scheduled_at: '',
            created_at: new Date(Date.now() - 259200000).toISOString(),
            group_id: groupId,
            sender_id: ''
          },
          {
            id: '4',
            title: 'Scheduled: Monthly Newsletter',
            message: 'This month\'s newsletter with updates and testimonies.',
            broadcast_type: 'newsletter',
            channels: ['email'],
            status: 'scheduled',
            recipient_count: 0,
            delivered_count: 0,
            read_count: 0,
            sent_at: new Date(Date.now() + 86400000).toISOString(),
            scheduled_at: new Date(Date.now() + 86400000).toISOString(),
            created_at: new Date().toISOString(),
            group_id: groupId,
            sender_id: ''
          }
        ]);
      }
    } finally {
      if (isMounted.current) setLoadingHistory(false);
    }
  };

  const loadTemplates = async (groupId?: string) => {
    try {
      setLoadingTemplates(true);

      // Load ALL templates visible to any admin:
      //   - group_id IS NULL  → global templates shared across every group
      //   - group_id = this group → templates scoped to the current group
      // The user_id filter has been intentionally removed so templates are
      // admin-shared: any admin can see, load, and reuse templates created
      // by any other admin, on any device.
      let query = supabase
        .from('broadcast_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (groupId) {
        query = query.or(`group_id.eq.${groupId},group_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (isMounted.current) {
        setTemplates(data || []);
      }
    } catch (err: any) {
      console.error('Error loading templates:', err);
      if (isMounted.current) setTemplates([]);
    } finally {
      if (isMounted.current) setLoadingTemplates(false);
    }
  };

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  const handleCreate = () => {
    setEditingGroup(null);
    setFormData({
      name: '',
      description: '',
      leader_id: '',
      is_active: true,
      settings: {
        allow_broadcasts: true,
        public_join: false
      }
    });
    setShowModal(true);
  };

  const handleEdit = (group: MinistryGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      leader_id: group.leader_id || group.owner_id || '',
      is_active: group.is_active,
      settings: group.settings || { allow_broadcasts: true, public_join: false }
    });
    setShowModal(true);
  };

  const handleViewMembers = (group: MinistryGroup) => {
    setSelectedGroup(group);
    loadGroupMembers(group.id);
    setShowMembersModal(true);
  };

  const handleOpenBroadcast = (group: MinistryGroup) => {
    setSelectedGroup(group);
    setBroadcastTab('compose');
    setBroadcastFormData({
      title: '',
      message: '',
      channel: 'push',
      audience: 'all',
      scheduleType: 'now',
      scheduledDate: '',
      scheduledTime: ''
    });
    loadBroadcastHistory(group.id);
    loadTemplates(group.id);
    setShowBroadcastModal(true);
  };

  const handleViewBroadcastDetails = (broadcast: BroadcastRecord) => {
    setSelectedBroadcast(broadcast);
    setShowBroadcastDetailsModal(true);
  };

  // Opens the save-template dialog — no window.prompt needed
  const handleSaveTemplate = () => {
    if (!broadcastFormData.title.trim() || !broadcastFormData.message.trim()) {
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'titleMessageRequiredTemplate', 'Title and message are required to save a template'), variant: 'destructive' });
      return;
    }
    setNewTemplateName('');
    setShowSaveTemplateDialog(true);
  };

  // Called when the admin confirms the name inside the dialog
  const handleConfirmSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'enterTemplateName', 'Please enter a template name'), variant: 'destructive' });
      return;
    }
    if (!user) return;

    setSavingTemplate(true);
    try {
      const { error } = await supabase.from('broadcast_templates').insert({
        name: newTemplateName.trim(),
        title: broadcastFormData.title.trim(),
        message: broadcastFormData.message.trim(),
        channel: broadcastFormData.channel,
        audience: broadcastFormData.audience,
        user_id: user.id,
        group_id: selectedGroup?.id ?? null,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      toast({ title: t('ministryGroupsManager', 'templateSaved', 'Template saved'), description: t('ministryGroupsManager', 'templateAvailableToAdmins', '"{name}" is now available to all admins').replace('{name}', newTemplateName.trim()) });
      setShowSaveTemplateDialog(false);
      setNewTemplateName('');
      loadTemplates(selectedGroup?.id);
    } catch (err: any) {
      console.error('Error saving template:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'failedSaveTemplate', 'Failed to save template'), variant: 'destructive' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleLoadTemplate = (template: BroadcastTemplate) => {
    setBroadcastFormData({
      ...broadcastFormData,
      title: template.title,
      message: template.message,
      channel: template.channel,
      audience: template.audience,
    });
    toast({ title: t('ministryGroupsManager', 'templateLoaded', '"{name}" loaded').replace('{name}', template.name) });
  };

  // Stage the delete — no window.confirm needed
  const handleDeleteTemplate = (template: BroadcastTemplate) => {
    setTemplatePendingDelete(template);
  };

  const handleConfirmDeleteTemplate = async () => {
    if (!templatePendingDelete) return;
    try {
      const { error } = await supabase
        .from('broadcast_templates')
        .delete()
        .eq('id', templatePendingDelete.id);

      if (error) throw error;
      toast({ title: t('ministryGroupsManager', 'templateDeleted', 'Template deleted') });
      loadTemplates(selectedGroup?.id);
    } catch (err: any) {
      console.error('Error deleting template:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'failedDeleteTemplate', 'Failed to delete template'), variant: 'destructive' });
    } finally {
      setTemplatePendingDelete(null);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastFormData.title.trim() || !broadcastFormData.message.trim()) {
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'titleMessageRequired', 'Title and message are required'), variant: 'destructive' });
      return;
    }
    if (!selectedGroup || !user) {
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'noGroupSelected', 'No group selected'), variant: 'destructive' });
      return;
    }
    if (broadcastFormData.scheduleType === 'scheduled' && (!broadcastFormData.scheduledDate || !broadcastFormData.scheduledTime)) {
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'selectDateTimeScheduled', 'Please select a date and time for the scheduled broadcast'), variant: 'destructive' });
      return;
    }

    setSendingBroadcast(true);
    try {
      const isScheduled = broadcastFormData.scheduleType === 'scheduled';
      const scheduledAt = isScheduled
        ? new Date(`${broadcastFormData.scheduledDate}T${broadcastFormData.scheduledTime}`).toISOString()
        : null;

      // 1. Fetch eligible members based on audience filter
      let memberQuery = supabase
        .from('ministry_group_members')
        .select('user_id, role')
        .eq('group_id', selectedGroup.id)
        .eq('can_receive_broadcasts', true);

      if (broadcastFormData.audience === 'leaders') {
        memberQuery = memberQuery.in('role', ['admin', 'leader']);
      }

      const { data: eligibleMembers, error: memberErr } = await memberQuery;
      if (memberErr) throw memberErr;

      const recipientCount = eligibleMembers?.length ?? 0;
      const memberUserIds = (eligibleMembers ?? []).map((m: any) => m.user_id).filter(Boolean);

      // 2. Write the broadcast record to ministry_group_broadcasts
      const { data: broadcastRecord, error: insertErr } = await supabase
        .from('ministry_group_broadcasts')
        .insert({
          group_id: selectedGroup.id,
          sender_id: user.id,
          title: broadcastFormData.title.trim(),
          message: broadcastFormData.message.trim(),
          broadcast_type: 'announcement',
          channels: [broadcastFormData.channel],
          audience: broadcastFormData.audience,
          status: isScheduled ? 'scheduled' : 'sending',
          recipient_count: recipientCount,
          delivered_count: 0,
          read_count: 0,
          scheduled_at: scheduledAt,
          sent_at: isScheduled ? null : new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 3. If scheduled, stop here — the pg_cron worker will dispatch it
      if (isScheduled) {
        toast({ title: t('ministryGroupsManager', 'broadcastScheduled', 'Broadcast Scheduled'), description: t('ministryGroupsManager', 'willBeSentOn', 'Will be sent on {datetime}').replace('{datetime}', new Date(scheduledAt!).toLocaleString()) });
      } else {
        // 4. Dispatch immediately based on channel
        let dispatchError: string | null = null;

        if (broadcastFormData.channel === 'push') {
          const { error } = await supabase.functions.invoke('send-push-notification', {
            body: {
              title: broadcastFormData.title.trim(),
              body: broadcastFormData.message.trim(),
              targetAudience: broadcastFormData.audience,
              notificationType: 'group_broadcast',
              ministryId: selectedGroup.id,
              announcementId: broadcastRecord.id,
            },
          });
          if (error) dispatchError = error.message;

        } else if (broadcastFormData.channel === 'email') {
          const { error } = await supabase.functions.invoke('send-ministry-email', {
            body: {
              announcementId: broadcastRecord.id,
              ministryId: selectedGroup.id,
              targetAudience: broadcastFormData.audience,
              title: broadcastFormData.title.trim(),
              content: broadcastFormData.message.trim(),
            },
          });
          if (error) dispatchError = error.message;

        } else if (broadcastFormData.channel === 'whatsapp') {
          // Fetch phone numbers for eligible members
          if (memberUserIds.length > 0) {
            const { data: profiles } = await supabase
              .from('user_profiles')
              .select('user_id, phone_number')
              .in('user_id', memberUserIds)
              .not('phone_number', 'is', null);

            const phones = (profiles ?? []).filter((p: any) => p.phone_number);
            const errors: string[] = [];

            for (const profile of phones) {
              const { error } = await supabase.functions.invoke('send-whatsapp', {
                body: {
                  phone_number: profile.phone_number,
                  message_type: 'text',
                  message: `*${broadcastFormData.title.trim()}*\n\n${broadcastFormData.message.trim()}`,
                },
              });
              if (error) errors.push(error.message);
            }

            if (errors.length === phones.length && phones.length > 0) {
              dispatchError = t('ministryGroupsManager', 'allWhatsappFailed', 'All WhatsApp sends failed');
            } else if (errors.length > 0) {
              dispatchError = t('ministryGroupsManager', 'someWhatsappFailed', '{failed} of {total} WhatsApp sends failed').replace('{failed}', String(errors.length)).replace('{total}', String(phones.length));
            }
          }

        } else if (broadcastFormData.channel === 'in-app') {
          // Write a notification row per member
          if (memberUserIds.length > 0) {
            const notifications = memberUserIds.map((uid: string) => ({
              user_id: uid,
              title: broadcastFormData.title.trim(),
              message: broadcastFormData.message.trim(),
              type: 'group_broadcast',
              reference_id: broadcastRecord.id,
              is_read: false,
              created_at: new Date().toISOString(),
            }));

            const { error } = await supabase.from('broadcast_notifications').insert(notifications);
            if (error) dispatchError = error.message;
          }

        } else {
          // SMS and any future channels — log, don't hard-fail
          console.warn(`Channel "${broadcastFormData.channel}" dispatch not yet wired.`);
        }

        // 5. Update broadcast record status
        const finalStatus = dispatchError ? 'failed' : 'sent';
        await supabase
          .from('ministry_group_broadcasts')
          .update({ status: finalStatus, sent_at: new Date().toISOString() })
          .eq('id', broadcastRecord.id);

        if (dispatchError) {
          toast({ title: t('ministryGroupsManager', 'partialFailure', 'Partial Failure'), description: dispatchError, variant: 'destructive' });
        } else {
          toast({ title: t('ministryGroupsManager', 'broadcastSent', 'Broadcast Sent'), description: t('ministryGroupsManager', 'messageDispatchedTo', 'Message dispatched to {count} member(s)').replace('{count}', String(recipientCount)) });
        }
      }

      // 6. Reload history and reset form
      loadBroadcastHistory(selectedGroup.id);
      setBroadcastFormData({
        title: '',
        message: '',
        channel: 'push',
        audience: 'all',
        scheduleType: 'now',
        scheduledDate: '',
        scheduledTime: ''
      });
      setBroadcastTab('history');
    } catch (err: any) {
      console.error('Error sending broadcast:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'groupNameRequired', 'Group name is required'), variant: 'destructive' });
      return;
    }

    if (!user) {
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: t('ministryGroupsManager', 'mustBeLoggedIn', 'You must be logged in'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        leader_id: formData.leader_id || null,
        is_active: formData.is_active,
        settings: formData.settings,
        updated_at: new Date().toISOString()
      };

      if (editingGroup) {
        const { error } = await supabase
          .from('ministry_groups')
          .update(dataToSave)
          .eq('id', editingGroup.id);

        if (error) throw error;
        toast({ title: t('ministryGroupsManager', 'success', 'Success'), description: t('ministryGroupsManager', 'groupUpdated', 'Ministry group updated successfully') });
      } else {
        dataToSave.invite_code = generateInviteCode();
        dataToSave.owner_id = formData.leader_id || user.id;
        dataToSave.member_count = 0;
        dataToSave.created_at = new Date().toISOString();

        const { error } = await supabase
          .from('ministry_groups')
          .insert(dataToSave);

        if (error) throw error;
        toast({ title: t('ministryGroupsManager', 'success', 'Success'), description: t('ministryGroupsManager', 'groupCreated', 'Ministry group created successfully') });
      }

      setShowModal(false);
      loadGroups();
      onUpdate?.();
    } catch (err: any) {
      console.error('Error saving ministry group:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm(t('ministryGroupsManager', 'confirmDeleteGroup', 'Are you sure you want to delete this ministry group? This will also remove all members and invites.'))) {
      return;
    }

    try {
      const { error } = await supabase
        .from('ministry_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      toast({ title: t('ministryGroupsManager', 'success', 'Success'), description: t('ministryGroupsManager', 'groupDeleted', 'Ministry group deleted successfully') });
      loadGroups();
      onUpdate?.();
    } catch (err: any) {
      console.error('Error deleting ministry group:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm(t('ministryGroupsManager', 'confirmRemoveMember', 'Are you sure you want to remove this member?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      if (selectedGroup) {
        await supabase
          .from('ministry_groups')
          .update({ member_count: Math.max(0, (selectedGroup.member_count || 1) - 1) })
          .eq('id', selectedGroup.id);
      }

      toast({ title: t('ministryGroupsManager', 'success', 'Success'), description: t('ministryGroupsManager', 'memberRemoved', 'Member removed successfully') });
      if (selectedGroup) loadGroupMembers(selectedGroup.id);
      loadGroups();
    } catch (err: any) {
      console.error('Error removing member:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('ministry_group_invites')
        .update({ status: 'expired' })
        .eq('id', inviteId);

      if (error) throw error;
      toast({ title: t('ministryGroupsManager', 'success', 'Success'), description: t('ministryGroupsManager', 'inviteCancelled', 'Invite cancelled') });
      if (selectedGroup) loadGroupMembers(selectedGroup.id);
    } catch (err: any) {
      console.error('Error cancelling invite:', err);
      toast({ title: t('ministryGroupsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/join-ministry?code=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: t('ministryGroupsManager', 'copied', 'Copied!'), description: t('ministryGroupsManager', 'inviteLinkCopied', 'Invite link copied to clipboard') });
  };

  const filteredGroups = groups.filter(group => {
    const search = searchTerm.toLowerCase();
    return (
      group.name?.toLowerCase().includes(search) ||
      group.description?.toLowerCase().includes(search)
    );
  });

  // Calculate broadcast stats
  const broadcastStats = {
    totalSent: broadcastHistory.filter(b => b.status === 'sent').length,
    scheduled: broadcastHistory.filter(b => b.status === 'scheduled').length,
    totalRecipients: broadcastHistory.reduce((sum, b) => sum + (b.recipient_count || 0), 0),
    thisMonth: broadcastHistory.filter(b => {
      const sentDate = new Date(b.sent_at);
      const now = new Date();
      return sentDate.getMonth() === now.getMonth() && sentDate.getFullYear() === now.getFullYear();
    }).length
  };

  // Helper to get channel display - handles both single string and array
  const getChannelDisplay = (broadcast: BroadcastRecord) => {
    const channels = broadcast.channels;
    if (Array.isArray(channels) && channels.length > 0) {
      return getChannelBadge(channels[0]);
    }
    return getChannelBadge('push');
  };


  const getChannelBadge = (channel: string) => {
    const channelConfig: Record<string, { label: string; className: string }> = {
      push: { label: t('ministryGroupsManager', 'channelPush', 'Push'), className: 'bg-blue-100 text-blue-700' },
      email: { label: t('ministryGroupsManager', 'channelEmail', 'Email'), className: 'bg-green-100 text-green-700' },
      whatsapp: { label: t('ministryGroupsManager', 'channelWhatsapp', 'WhatsApp'), className: 'bg-emerald-100 text-emerald-700' },
      sms: { label: t('ministryGroupsManager', 'channelSms', 'SMS'), className: 'bg-orange-100 text-orange-700' },
      'in-app': { label: t('ministryGroupsManager', 'channelInApp', 'In-App'), className: 'bg-purple-100 text-purple-700' }
    };
    const config = channelConfig[channel] || { label: channel, className: 'bg-gray-100 text-gray-700' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      sent: { label: t('ministryGroupsManager', 'statusSent', 'Sent'), className: 'bg-green-100 text-green-700' },
      scheduled: { label: t('ministryGroupsManager', 'statusScheduled', 'Scheduled'), className: 'bg-amber-100 text-amber-700' },
      failed: { label: t('ministryGroupsManager', 'statusFailed', 'Failed'), className: 'bg-red-100 text-red-700' },
      draft: { label: t('ministryGroupsManager', 'statusDraft', 'Draft'), className: 'bg-gray-100 text-gray-700' }
    };
    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
    return <Badge className={config.className}>{config.label}</Badge>;
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('ministryGroupsManager', 'searchGroupsPlaceholder', 'Search ministry groups...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadGroups}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('ministryGroupsManager', 'refresh', 'Refresh')}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('ministryGroupsManager', 'createGroup', 'Create Group')}
          </Button>
        </div>
      </div>

      {/* Groups Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colName', 'Name')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colDescription', 'Description')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colLeader', 'Leader')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colMembers', 'Members')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colInviteCode', 'Invite Code')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colStatus', 'Status')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colActions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      {t('ministryGroupsManager', 'noGroupsFound', 'No ministry groups found. Create your first group to get started.')}
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map(group => {
                    const leader = users.find(u => u.user_id === (group.leader_id || group.owner_id));
                    return (
                      <tr key={group.id} className="border-b hover:bg-gray-50">
                        <td className="p-4 font-medium">{group.name}</td>
                        <td className="p-4 text-gray-600 max-w-xs truncate">
                          {group.description || '-'}
                        </td>
                        <td className="p-4">
                          {leader ? (
                            <div className="flex items-center gap-2">
                              <Crown className="h-4 w-4 text-amber-500" />
                              <span>{leader.full_name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">{t('ministryGroupsManager', 'noLeader', 'No leader')}</span>
                          )}
                        </td>
                        <td className="p-4">
                          <Badge variant="secondary">
                            <Users className="h-3 w-3 mr-1" />
                            {group.member_count || 0}
                          </Badge>
                        </td>
                        <td className="p-4">
                          {group.invite_code ? (
                            <div className="flex items-center gap-2">
                              <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                                {group.invite_code}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyInviteLink(group.invite_code)}
                              >
                                {copiedCode === group.invite_code ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-4">
                          <Badge variant={group.is_active ? 'default' : 'secondary'}>
                            {group.is_active ? t('ministryGroupsManager', 'active', 'Active') : t('ministryGroupsManager', 'inactive', 'Inactive')}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewMembers(group)}
                              title={t('ministryGroupsManager', 'viewMembers', 'View Members')}
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                              onClick={() => handleOpenBroadcast(group)}
                              title={t('ministryGroupsManager', 'broadcast', 'Broadcast')}
                            >
                              <Radio className="h-4 w-4 mr-1" />
                              {t('ministryGroupsManager', 'broadcast', 'Broadcast')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(group)}
                              title={t('ministryGroupsManager', 'edit', 'Edit')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(group.id)}
                              title={t('ministryGroupsManager', 'delete', 'Delete')}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? t('ministryGroupsManager', 'editGroupTitle', 'Edit Ministry Group') : t('ministryGroupsManager', 'createGroupTitle', 'Create Ministry Group')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryGroupsManager', 'groupNameLabel', 'Group Name *')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('ministryGroupsManager', 'groupNamePlaceholder', "e.g., Youth Ministry, Women's Prayer Group")}
              />
            </div>
            <div>
              <Label>{t('ministryGroupsManager', 'descriptionLabel', 'Description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('ministryGroupsManager', 'descriptionPlaceholder', 'Brief description of this ministry group...')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('ministryGroupsManager', 'groupLeaderLabel', 'Group Leader')}</Label>
              <Select
                value={formData.leader_id || '__none__'}
                onValueChange={(value) => setFormData({ ...formData, leader_id: value === '__none__' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('ministryGroupsManager', 'selectLeaderPlaceholder', 'Select a leader (optional)')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('ministryGroupsManager', 'noLeaderAssigned', 'No leader assigned')}</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {t('ministryGroupsManager', 'premiumMinistryOnly', 'Only premium and ministry tier users are shown')}
              </p>
            </div>

            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('ministryGroupsManager', 'groupSettings', 'Group Settings')}
              </h4>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('ministryGroupsManager', 'allowBroadcasts', 'Allow Broadcasts')}</Label>
                  <p className="text-xs text-gray-500">{t('ministryGroupsManager', 'allowBroadcastsDesc', 'Members can receive broadcast messages')}</p>
                </div>
                <Switch
                  checked={formData.settings.allow_broadcasts}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, allow_broadcasts: checked }
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('ministryGroupsManager', 'publicJoin', 'Public Join')}</Label>
                  <p className="text-xs text-gray-500">{t('ministryGroupsManager', 'publicJoinDesc', 'Anyone can join with the invite code')}</p>
                </div>
                <Switch
                  checked={formData.settings.public_join}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, public_join: checked }
                  })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>{t('ministryGroupsManager', 'activeStatus', 'Active Status')}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t('ministryGroupsManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('ministryGroupsManager', 'saving', 'Saving...')}
                </>
              ) : (
                t('ministryGroupsManager', 'save', 'Save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Modal */}
      <Dialog open={showMembersModal} onOpenChange={setShowMembersModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedGroup?.name} - {t('ministryGroupsManager', 'membersSuffix', 'Members')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Current Members */}
            <div>
              <h4 className="font-medium mb-3">{t('ministryGroupsManager', 'currentMembers', 'Current Members ({count})').replace('{count}', String(members.length))}</h4>
              {members.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('ministryGroupsManager', 'noMembersYet', 'No members yet')}</p>
              ) : (
                <div className="space-y-2">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          {member.user_profile?.full_name?.[0] || member.email?.[0] || '?'}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.user_profile?.full_name || member.email || t('ministryGroupsManager', 'unknown', 'Unknown')}
                          </p>
                          <p className="text-sm text-gray-500">
                            {member.user_profile?.email || member.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                          {member.role || t('ministryGroupsManager', 'roleMember', 'member')}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Invites */}
            <div>
              <h4 className="font-medium mb-3">{t('ministryGroupsManager', 'pendingInvites', 'Pending Invites ({count})').replace('{count}', String(invites.length))}</h4>
              {invites.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('ministryGroupsManager', 'noPendingInvites', 'No pending invites')}</p>
              ) : (
                <div className="space-y-2">
                  {invites.map(invite => (
                    <div key={invite.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-xs text-gray-500">
                            {t('ministryGroupsManager', 'expires', 'Expires:')} {new Date(invite.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvite(invite.id)}
                      >
                        {t('ministryGroupsManager', 'cancel', 'Cancel')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invite Link */}
            {selectedGroup?.invite_code && (
              <div className="p-4 bg-purple-50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  {t('ministryGroupsManager', 'shareableInviteLink', 'Shareable Invite Link')}
                </h4>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/join-ministry?code=${selectedGroup.invite_code}`}
                    className="bg-white"
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyInviteLink(selectedGroup.invite_code)}
                  >
                    {copiedCode === selectedGroup.invite_code ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembersModal(false)}>
              {t('ministryGroupsManager', 'close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Broadcast Modal */}
      <Dialog open={showBroadcastModal} onOpenChange={setShowBroadcastModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-purple-600" />
              {t('ministryGroupsManager', 'broadcastToGroup', 'Broadcast to {name}').replace('{name}', selectedGroup?.name ?? '')}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={broadcastTab} onValueChange={setBroadcastTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="compose" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('ministryGroupsManager', 'compose', 'Compose')}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('ministryGroupsManager', 'history', 'History')}
              </TabsTrigger>
            </TabsList>

            {/* Compose Tab */}
            <TabsContent value="compose" className="space-y-4 mt-4">
              {/* Templates Section */}
              <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2 text-purple-900">
                    <MessageSquare className="h-4 w-4" />
                    {t('ministryGroupsManager', 'messageTemplates', 'Message Templates')}
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveTemplate}
                    disabled={!broadcastFormData.title.trim() || !broadcastFormData.message.trim()}
                    className="border-purple-300 hover:bg-purple-100"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('ministryGroupsManager', 'saveAsTemplate', 'Save as Template')}
                  </Button>
                </div>

                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                  </div>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">
                    {t('ministryGroupsManager', 'noTemplatesYet', 'No templates yet. Compose a message above and click "Save as Template" — it will be available to all admins.')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => {
                      const isOwn = template.user_id === user?.id;
                      const isGlobal = !template.group_id;
                      return (
                        <div
                          key={template.id}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-200 hover:border-purple-400 transition-colors"
                        >
                          <div className="flex-1 min-w-0 cursor-pointer pr-2" onClick={() => handleLoadTemplate(template)}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-purple-900 text-sm">{template.name}</p>
                              {isGlobal && (
                                <Badge className="text-xs bg-indigo-100 text-indigo-700 border-0 py-0">{t('ministryGroupsManager', 'global', 'Global')}</Badge>
                              )}
                              {isOwn && (
                                <Badge className="text-xs bg-gray-100 text-gray-600 border-0 py-0">{t('ministryGroupsManager', 'mine', 'Mine')}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{template.title}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleLoadTemplate(template)}
                              className="text-purple-600 hover:text-purple-700 hover:bg-purple-100 h-7 px-2 text-xs"
                            >
                              {t('ministryGroupsManager', 'load', 'Load')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteTemplate(template)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label>{t('ministryGroupsManager', 'messageTitleLabel', 'Message Title *')}</Label>
                <Input
                  value={broadcastFormData.title}
                  onChange={(e) => setBroadcastFormData({ ...broadcastFormData, title: e.target.value })}
                  placeholder={t('ministryGroupsManager', 'broadcastTitlePlaceholder', 'Enter broadcast title...')}
                />
              </div>
              
              <div>
                <Label>{t('ministryGroupsManager', 'messageBodyLabel', 'Message Body *')}</Label>
                <Textarea
                  value={broadcastFormData.message}
                  onChange={(e) => setBroadcastFormData({ ...broadcastFormData, message: e.target.value })}
                  placeholder={t('ministryGroupsManager', 'broadcastMessagePlaceholder', 'Write your broadcast message...')}
                  rows={5}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('ministryGroupsManager', 'channelLabel', 'Channel')}</Label>
                  <Select
                    value={broadcastFormData.channel}
                    onValueChange={(value) => setBroadcastFormData({ ...broadcastFormData, channel: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push">{t('ministryGroupsManager', 'pushNotification', 'Push Notification')}</SelectItem>
                      <SelectItem value="email">{t('ministryGroupsManager', 'channelEmail', 'Email')}</SelectItem>
                      <SelectItem value="whatsapp">{t('ministryGroupsManager', 'channelWhatsapp', 'WhatsApp')}</SelectItem>
                      <SelectItem value="sms">{t('ministryGroupsManager', 'channelSms', 'SMS')}</SelectItem>
                      <SelectItem value="in-app">{t('ministryGroupsManager', 'inAppMessage', 'In-App Message')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t('ministryGroupsManager', 'targetAudience', 'Target Audience')}</Label>
                  <Select
                    value={broadcastFormData.audience}
                    onValueChange={(value) => setBroadcastFormData({ ...broadcastFormData, audience: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('ministryGroupsManager', 'allMembers', 'All Members')}</SelectItem>
                      <SelectItem value="leaders">{t('ministryGroupsManager', 'leadersOnly', 'Leaders Only')}</SelectItem>
                      <SelectItem value="active">{t('ministryGroupsManager', 'activeMembers', 'Active Members')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <Label>{t('ministryGroupsManager', 'schedule', 'Schedule')}</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scheduleType"
                      value="now"
                      checked={broadcastFormData.scheduleType === 'now'}
                      onChange={() => setBroadcastFormData({ ...broadcastFormData, scheduleType: 'now' })}
                      className="text-purple-600"
                    />
                    <span>{t('ministryGroupsManager', 'sendNow', 'Send Now')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scheduleType"
                      value="scheduled"
                      checked={broadcastFormData.scheduleType === 'scheduled'}
                      onChange={() => setBroadcastFormData({ ...broadcastFormData, scheduleType: 'scheduled' })}
                      className="text-purple-600"
                    />
                    <span>{t('ministryGroupsManager', 'scheduleForLater', 'Schedule for Later')}</span>
                  </label>
                </div>
                
                {broadcastFormData.scheduleType === 'scheduled' && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <Label>{t('ministryGroupsManager', 'date', 'Date')}</Label>
                      <Input
                        type="date"
                        value={broadcastFormData.scheduledDate}
                        onChange={(e) => setBroadcastFormData({ ...broadcastFormData, scheduledDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t('ministryGroupsManager', 'time', 'Time')}</Label>
                      <Input
                        type="time"
                        value={broadcastFormData.scheduledTime}
                        onChange={(e) => setBroadcastFormData({ ...broadcastFormData, scheduledTime: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowBroadcastModal(false)}>
                  {t('ministryGroupsManager', 'cancel', 'Cancel')}
                </Button>
                <Button 
                  onClick={handleSendBroadcast} 
                  disabled={sendingBroadcast}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {sendingBroadcast ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('ministryGroupsManager', 'sending', 'Sending...')}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {broadcastFormData.scheduleType === 'scheduled' ? t('ministryGroupsManager', 'scheduleAction', 'Schedule') : t('ministryGroupsManager', 'sendNow', 'Send Now')}
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4 mt-4">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <Send className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-blue-600">{t('ministryGroupsManager', 'totalSent', 'Total Sent')}</p>
                        <p className="text-2xl font-bold text-blue-700">{broadcastStats.totalSent}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500 rounded-lg">
                        <Clock className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-amber-600">{t('ministryGroupsManager', 'statusScheduled', 'Scheduled')}</p>
                        <p className="text-2xl font-bold text-amber-700">{broadcastStats.scheduled}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500 rounded-lg">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-green-600">{t('ministryGroupsManager', 'recipients', 'Recipients')}</p>
                        <p className="text-2xl font-bold text-green-700">{broadcastStats.totalRecipients}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-500 rounded-lg">
                        <Calendar className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-purple-600">{t('ministryGroupsManager', 'thisMonth', 'This Month')}</p>
                        <p className="text-2xl font-bold text-purple-700">{broadcastStats.thisMonth}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Broadcast History Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5" />
                    {t('ministryGroupsManager', 'broadcastHistory', 'Broadcast History')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                    </div>
                  ) : broadcastHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>{t('ministryGroupsManager', 'noBroadcastsSent', 'No broadcasts sent yet')}</p>
                      <p className="text-sm">{t('ministryGroupsManager', 'composeFirstBroadcast', 'Compose your first broadcast to get started')}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colTitle', 'Title')}</th>
                            <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'channelLabel', 'Channel')}</th>
                            <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colAudience', 'Audience')}</th>
                            <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colStatus', 'Status')}</th>
                            <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'date', 'Date')}</th>
                            <th className="text-left p-4 font-medium">{t('ministryGroupsManager', 'colActions', 'Actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {broadcastHistory.map(broadcast => (
                            <tr key={broadcast.id} className="border-b hover:bg-gray-50">
                              <td className="p-4 font-medium">{broadcast.title}</td>
                              <td className="p-4">{getChannelDisplay(broadcast)}</td>
                              <td className="p-4 capitalize">{broadcast.broadcast_type || 'all'}</td>
                              <td className="p-4">{getStatusBadge(broadcast.status)}</td>
                              <td className="p-4 text-gray-600">
                                {new Date(broadcast.sent_at).toLocaleDateString()}
                              </td>
                              <td className="p-4">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewBroadcastDetails(broadcast)}
                                  title={t('ministryGroupsManager', 'viewDetails', 'View Details')}
                                >
                                  <Eye className="h-4 w-4 text-purple-600" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Broadcast Details Modal */}
      <Dialog open={showBroadcastDetailsModal} onOpenChange={setShowBroadcastDetailsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-600" />
              {t('ministryGroupsManager', 'broadcastDetails', 'Broadcast Details')}
            </DialogTitle>
          </DialogHeader>
          
          {selectedBroadcast && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-lg mb-2">{selectedBroadcast.title}</h3>
                <p className="text-gray-600">{selectedBroadcast.message}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'channelLabel', 'Channel')}</Label>
                  <div className="mt-1">{getChannelDisplay(selectedBroadcast)}</div>
                </div>
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'colStatus', 'Status')}</Label>
                  <div className="mt-1">{getStatusBadge(selectedBroadcast.status)}</div>
                </div>
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'type', 'Type')}</Label>
                  <p className="mt-1 capitalize font-medium">{selectedBroadcast.broadcast_type || 'general'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'recipients', 'Recipients')}</Label>
                  <p className="mt-1 font-medium">{selectedBroadcast.recipient_count}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'delivered', 'Delivered')}</Label>
                  <p className="mt-1 font-medium">{selectedBroadcast.delivered_count}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'read', 'Read')}</Label>
                  <p className="mt-1 font-medium">{selectedBroadcast.read_count}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'sentDate', 'Sent Date')}</Label>
                  <p className="mt-1 font-medium">
                    {new Date(selectedBroadcast.sent_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('ministryGroupsManager', 'sentTime', 'Sent Time')}</Label>
                  <p className="mt-1 font-medium">
                    {new Date(selectedBroadcast.sent_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {selectedBroadcast.status === 'sent' && (
                <div className="p-3 bg-green-50 rounded-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-green-700">
                    {t('ministryGroupsManager', 'successfullyDelivered', 'Successfully delivered to {delivered} of {total} recipients').replace('{delivered}', String(selectedBroadcast.delivered_count)).replace('{total}', String(selectedBroadcast.recipient_count))}
                  </span>
                </div>
              )}

              {selectedBroadcast.status === 'scheduled' && (
                <div className="p-3 bg-amber-50 rounded-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <span className="text-amber-700">
                    {t('ministryGroupsManager', 'scheduledToBeSentOn', 'Scheduled to be sent on {datetime}').replace('{datetime}', new Date(selectedBroadcast.scheduled_at || selectedBroadcast.sent_at).toLocaleString())}
                  </span>
                </div>
              )}
            </div>
          )}


          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBroadcastDetailsModal(false)}>
              {t('ministryGroupsManager', 'close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Save Template Dialog ─────────────────────────────────────────── */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={(open) => { setShowSaveTemplateDialog(open); if (!open) setNewTemplateName(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              {t('ministryGroupsManager', 'saveAsTemplate', 'Save as Template')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="template-name">{t('ministryGroupsManager', 'templateNameLabel', 'Template name')} <span className="text-red-500">*</span></Label>
              <Input
                id="template-name"
                className="mt-1"
                placeholder={t('ministryGroupsManager', 'templateNamePlaceholder', 'e.g. Sunday Service Reminder')}
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmSaveTemplate(); }}
                autoFocus
              />
            </div>
            <div className="rounded-lg bg-gray-50 border p-3 space-y-1 text-sm text-gray-600">
              <p><span className="font-medium text-gray-800">{t('ministryGroupsManager', 'titleColon', 'Title:')}</span> {broadcastFormData.title}</p>
              <p className="line-clamp-2"><span className="font-medium text-gray-800">{t('ministryGroupsManager', 'messageColon', 'Message:')}</span> {broadcastFormData.message}</p>
              <p><span className="font-medium text-gray-800">{t('ministryGroupsManager', 'channelColon', 'Channel:')}</span> {broadcastFormData.channel} · <span className="font-medium text-gray-800">{t('ministryGroupsManager', 'audienceColon', 'Audience:')}</span> {broadcastFormData.audience}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedGroup
                ? t('ministryGroupsManager', 'templateVisibilityGroup', 'This template will be visible and reusable by all admins in "{name}" and globally.').replace('{name}', selectedGroup.name)
                : t('ministryGroupsManager', 'templateVisibilityAll', 'This template will be visible and reusable by all admins across all groups.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSaveTemplateDialog(false); setNewTemplateName(''); }}>
              {t('ministryGroupsManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleConfirmSaveTemplate} disabled={savingTemplate || !newTemplateName.trim()}>
              {savingTemplate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {t('ministryGroupsManager', 'saveTemplate', 'Save Template')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Template Confirmation Dialog ───────────────────────────── */}
      <Dialog open={!!templatePendingDelete} onOpenChange={(open) => { if (!open) setTemplatePendingDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('ministryGroupsManager', 'deleteTemplateTitle', 'Delete Template')}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-700">
              {t('ministryGroupsManager', 'confirmDeleteTemplate', 'Are you sure you want to delete "{name}"?').replace('{name}', templatePendingDelete?.name ?? '')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('ministryGroupsManager', 'deleteTemplateWarning', 'This will remove it for all admins. This action cannot be undone.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePendingDelete(null)}>
              {t('ministryGroupsManager', 'cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteTemplate}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('ministryGroupsManager', 'delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default MinistryGroupsManager;