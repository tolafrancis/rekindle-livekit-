import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import {
  resolveMinistryRole, roleCan, roleLabel, roleToMemberColumns, normaliseRole,
  ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, type MinistryRole,
} from '@/lib/ministryPermissions';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Users, Search, Loader2, Crown, Shield, Edit, Trash2, UserPlus,
  Mail, Clock, Activity, Plus, Download, Send, Copy, CheckCircle,
  BarChart3, TrendingUp, Calendar, Award, Settings, Eye, Filter,
  UserX, Key, MessageSquare, Bell, X, Heart, BookOpen, Video,
  Share2, Target, PieChart, LineChart, Upload, FileText, AlertCircle,
  CheckCircle2, XCircle, FileDown, Radio, Smartphone
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface MinistryMembersManagerProps {
  ministryId: string;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  is_leader: boolean;
  subscription_level: number;
  joined_at: string;
  last_active: string;
  activity_score: number;
  is_registrant?: boolean;
  has_account?: boolean;
  gender?: string;
  date_of_birth?: string;
  city?: string;
  country?: string;
  membership_status?: string;
  consent_gift_aid?: boolean;
  user_full_name?: string;
  user_email?: string;
  user_phone?: string;
  user_profile?: {
    full_name: string;
    email: string;
    avatar_url: string;
    phone: string;
    location: string;
  };
}

interface Role {
  id: string;
  user_id: string;
  role_name: string;
  permissions: any;
  is_active: boolean;
  assigned_at: string;
  assigned_by: string;
}

interface Analytics {
  totalMembers: number;
  activeMembers: number;
  newThisMonth: number;
  avgActivityScore: number;
  roleDistribution: any[];
  membershipGrowth: number;
  topContributors: Member[];
}

interface MemberGrowthData {
  date: string;
  members: number;
  newMembers: number;
  growthRate: number;
}

interface EngagementMetrics {
  devotionalReads: number;
  prayerParticipation: number;
  eventAttendance: number;
  testimonyShares: number;
  broadcastInteractions: number;
}

interface ContentPerformance {
  id: string;
  title: string;
  type: 'devotional' | 'prayer' | 'event';
  views: number;
  engagement: number;
  date: string;
}

interface TopActiveMember extends Member {
  devotionalReads: number;
  prayerSessions: number;
  eventAttendance: number;
  testimonyShares: number;
  totalEngagement: number;
}

interface CSVImportRow {
  name: string;
  email: string;
  phone: string;
  city?: string;
  country?: string;
  gender?: string;
  date_of_birth?: string;
  membership_status?: string;
  rowNumber: number;
  status: 'pending' | 'valid' | 'invalid' | 'duplicate' | 'imported';
  errors: string[];
}

interface BroadcastMessage {
  title: string;
  message: string;
  senderName: string;
  channels: {
    push: boolean;
    whatsapp: boolean;
    zalo: boolean;
    inapp: boolean;
  };
  targetAudience: string;
  scheduledAt: string;
  isScheduled: boolean;
}

const ROLES = [
  { 
    value: 'owner', 
    label: 'Owner', 
    description: 'Full control over ministry',
    permissions: ['all']
  },
  { 
    value: 'admin', 
    label: 'Admin', 
    description: 'Manage all content and members',
    permissions: ['manage_content', 'manage_members', 'manage_donations', 'manage_events']
  },
  { 
    value: 'content_editor', 
    label: 'Content Editor', 
    description: 'Create and edit content',
    permissions: ['manage_content', 'view_analytics']
  },
  { 
    value: 'prayer_lead', 
    label: 'Prayer Lead', 
    description: 'Manage prayer requests and library',
    permissions: ['manage_prayers', 'view_prayer_requests']
  },
  { 
    value: 'event_coordinator', 
    label: 'Event Coordinator', 
    description: 'Manage events and registrations',
    permissions: ['manage_events', 'view_registrations']
  },
  { 
    value: 'moderator', 
    label: 'Moderator', 
    description: 'Moderate community content',
    permissions: ['moderate_content', 'manage_testimonies']
  },
  { 
    value: 'finance_officer', 
    label: 'Finance Officer', 
    description: 'View donations and financial reports',
    permissions: ['view_donations', 'view_financial_reports']
  },
  { 
    value: 'volunteer', 
    label: 'Volunteer', 
    description: 'Assist with ministry activities',
    permissions: ['view_content']
  },
  { 
    value: 'member', 
    label: 'Member', 
    description: 'Regular member access',
    permissions: ['view_content']
  }
];

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export const MinistryMembersManager: React.FC<MinistryMembersManagerProps> = ({
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState(false);  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);
  const [showCSVImportModal, setShowCSVImportModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('member');
  const [saving, setSaving] = useState(false);

  // CSV Import state
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [csvData, setCSVData] = useState<CSVImportRow[]>([]);
  const [csvImporting, setCSVImporting] = useState(false);
  const [csvValidating, setCSVValidating] = useState(false);
  const [csvImportProgress, setCSVImportProgress] = useState(0);
  const [csvImportResults, setCSVImportResults] = useState<{
    successful: number;
    failed: number;
    duplicates: number;
  }>({ successful: 0, failed: 0, duplicates: 0 });

  // Broadcast messaging state
  const [broadcastForm, setBroadcastForm] = useState<BroadcastMessage>({
    title: '',
    message: '',
    senderName: '',
    channels: {
      push: false,
      whatsapp: false,
      zalo: false,
      inapp: true
    },
    targetAudience: 'all',
    scheduledAt: '',
    isScheduled: false
  });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [ministryName, setMinistryName] = useState('');

  // Enhanced analytics state
  const [memberGrowthData, setMemberGrowthData] = useState<MemberGrowthData[]>([]);
  const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetrics | null>(null);
  const [contentPerformance, setContentPerformance] = useState<ContentPerformance[]>([]);
  const [topActiveMembers, setTopActiveMembers] = useState<TopActiveMember[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member',
    message: ''
  });

  useEffect(() => {
    loadMembers();
    loadRoles();
    loadAnalytics();
    // Owner/leader for permission checks (canonical table is ministry_groups)
    supabase
      .from('ministry_groups')
      .select('owner_id, leader_id')
      .eq('id', ministryId)
      .maybeSingle()
      .then(({ data }) => {
        setOwnerId(data?.owner_id ?? null);
        setLeaderId(data?.leader_id ?? null);
      });
    // Load ministry name for sender identity presets
    supabase
      .from('ministries')
      .select('name')
      .eq('id', ministryId)
      .single()
      .then(({ data }) => {
        if (data?.name) setMinistryName(data.name);
      });
  }, [ministryId]);

  const loadMembers = async () => {
    try {
      // 1. Auth-user members (leaders/admins/joined users) from the canonical view
      const { data: viewMembers, error } = await supabase
        .from('ministry_members_with_profiles')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('joined_at', { ascending: false });

      if (error) throw error;

      // 2. Active members who registered via QR/public form. They live in
      //    ministry_member_profiles (name/email stored directly; many have no auth
      //    account), so the view above never sees them. Pull and merge them in.
      const { data: regMembers } = await supabase
        .from('ministry_member_profiles')
        .select('*')
        .eq('ministry_id', ministryId)
        .eq('registration_status', 'active');

      const mappedReg: Member[] = (regMembers || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id || p.id,
        role: 'member',
        is_leader: false,
        subscription_level: 0,
        joined_at: p.approved_at || p.created_at,
        last_active: p.last_active || p.created_at,
        activity_score: p.activity_score ?? 0,
        is_registrant: true,
        has_account: !!p.user_id,
        gender: p.gender || '',
        date_of_birth: p.date_of_birth || '',
        city: p.city || '',
        country: p.country || '',
        membership_status: p.membership_status || '',
        consent_gift_aid: p.consent_gift_aid === true,
        user_full_name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.full_name || 'Member',
        user_email: p.email || '',
        user_phone: p.mobile_number || p.phone_number || '',
      }));

      // Merge + de-duplicate. Someone who is both an auth member and a registrant
      // (same user_id or email) should appear once — prefer the view row (carries role/is_leader).
      const seen = new Set<string>();
      const merged: Member[] = [];
      [...((viewMembers as Member[]) || []), ...mappedReg].forEach((m) => {
        const key = (m.user_id && String(m.user_id))
          || (m.user_email && m.user_email.toLowerCase())
          || m.id;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(m);
      });

      setMembers(merged);
    } catch (error: any) {
      toast({
        title: t('ministryMembersManager', 'errorLoadingMembers', 'Error loading members'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('ministry_id', ministryId);

      if (error) throw error;
      setRoles(data || []);
    } catch (error: any) {
      console.error('Error loading roles:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      const { data: analyticsData, error } = await supabase
        .rpc('get_ministry_member_analytics', { ministry_id_param: ministryId });

      if (error) throw error;
      setAnalytics(analyticsData);
    } catch (error: any) {
      console.error('Error loading analytics:', error);
    }
  };

  const loadEnhancedAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      // Load member growth data
      const { data: growthData, error: growthError } = await supabase
        .rpc('get_member_growth_data', { ministry_id_param: ministryId });
      if (!growthError && growthData) setMemberGrowthData(growthData);

      // Load engagement metrics
      const { data: engagementData, error: engagementError } = await supabase
        .rpc('get_engagement_metrics', { ministry_id_param: ministryId });
      if (!engagementError && engagementData) setEngagementMetrics(engagementData);

      // Load content performance
      const { data: contentData, error: contentError } = await supabase
        .rpc('get_content_performance', { ministry_id_param: ministryId });
      if (!contentError && contentData) setContentPerformance(contentData);

      // Load top active members
      const { data: topMembersData, error: topMembersError } = await supabase
        .rpc('get_top_active_members', { ministry_id_param: ministryId });
      if (!topMembersError && topMembersData) setTopActiveMembers(topMembersData);

    } catch (error: any) {
      console.error('Error loading enhanced analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // CSV Import Functions
  const handleCSVFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCSVFile(file);
      parseCSVFile(file);
    } else {
      toast({
        title: t('ministryMembersManager', 'invalidFile', 'Invalid file'),
        description: t('ministryMembersManager', 'selectValidCsvFile', 'Please select a valid CSV file'),
        variant: 'destructive'
      });
    }
  };

  const parseCSVFile = async (file: File) => {
    setCSVValidating(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV file must contain at least a header row and one data row');
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIndex = headers.findIndex(h => h.includes('name'));
      const emailIndex = headers.findIndex(h => h.includes('email'));
      const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('mobile'));
      const cityIndex = headers.findIndex(h => h.includes('city'));
      const countryIndex = headers.findIndex(h => h.includes('country'));
      const genderIndex = headers.findIndex(h => h.includes('gender'));
      const dobIndex = headers.findIndex(h => h.includes('birth') || h === 'dob');
      const statusIndex = headers.findIndex(h => h.includes('membership') || h.includes('status'));

      if (nameIndex === -1 || emailIndex === -1) {
        throw new Error('CSV must contain "name" and "email" columns');
      }

      const parsedData: CSVImportRow[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row: CSVImportRow = {
          name: values[nameIndex] || '',
          email: values[emailIndex] || '',
          phone: phoneIndex !== -1 ? values[phoneIndex] || '' : '',
          city: cityIndex !== -1 ? values[cityIndex] || '' : '',
          country: countryIndex !== -1 ? values[countryIndex] || '' : '',
          gender: genderIndex !== -1 ? values[genderIndex] || '' : '',
          date_of_birth: dobIndex !== -1 ? values[dobIndex] || '' : '',
          membership_status: statusIndex !== -1 ? values[statusIndex] || '' : '',
          rowNumber: i + 1,
          status: 'pending',
          errors: []
        };

        parsedData.push(row);
      }

      setCSVData(parsedData);
      validateCSVData(parsedData);
    } catch (error: any) {
      toast({
        title: t('ministryMembersManager', 'errorParsingCsv', 'Error parsing CSV'),
        description: error.message,
        variant: 'destructive'
      });
      setCSVFile(null);
    } finally {
      setCSVValidating(false);
    }
  };

  const validateCSVData = async (data: CSVImportRow[]) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;

    // Existing emails across BOTH stores: auth members (view) and member profiles
    const { data: existingView } = await supabase
      .from('ministry_members_with_profiles')
      .select('user_email')
      .eq('ministry_id', ministryId);
    const { data: existingProfiles } = await supabase
      .from('ministry_member_profiles')
      .select('email')
      .eq('ministry_id', ministryId);

    const existingEmails = new Set(
      [
        ...(existingView?.map(m => m.user_email?.toLowerCase()) || []),
        ...(existingProfiles?.map((m: any) => m.email?.toLowerCase()) || []),
      ].filter(Boolean)
    );

    const updatedData = data.map(row => {
      const errors: string[] = [];
      let status: CSVImportRow['status'] = 'valid';

      // Validate name
      if (!row.name || row.name.length < 2) {
        errors.push('Name must be at least 2 characters');
        status = 'invalid';
      }

      // Validate email
      if (!row.email) {
        errors.push('Email is required');
        status = 'invalid';
      } else if (!emailRegex.test(row.email)) {
        errors.push('Invalid email format');
        status = 'invalid';
      } else if (existingEmails.has(row.email.toLowerCase())) {
        errors.push('Email already exists in ministry');
        status = 'duplicate';
      }

      // Validate phone (if provided)
      if (row.phone && !phoneRegex.test(row.phone)) {
        errors.push('Invalid phone format');
        status = 'invalid';
      }

      return { ...row, status, errors };
    });

    setCSVData(updatedData);
  };

  const importCSVMembers = async () => {
    const validRows = csvData.filter(row => row.status === 'valid');
    
    if (validRows.length === 0) {
      toast({
        title: t('ministryMembersManager', 'noValidMembersToImport', 'No valid members to import'),
        description: t('ministryMembersManager', 'fixValidationErrors', 'Please fix validation errors and try again'),
        variant: 'destructive'
      });
      return;
    }

    setCSVImporting(true);
    setCSVImportProgress(0);
    
    let successful = 0;
    let failed = 0;
    const duplicates = csvData.filter(row => row.status === 'duplicate').length;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      
      try {
        // Create a church-member profile (same store as QR registration), marked active
        // so it shows in the member list. No auth account is created — imported people are
        // contact records and can link an account later by signing in with this email.
        const parts = row.name.trim().split(/\s+/);
        const firstName = parts.shift() || row.name.trim();
        const lastName = parts.join(' ');

        const { error: insertError } = await supabase
          .from('ministry_member_profiles')
          .insert({
            ministry_id: ministryId,
            first_name: firstName,
            last_name: lastName,
            email: row.email.trim(),
            mobile_number: row.phone || '',
            city: row.city || '',
            country: row.country || '',
            gender: row.gender || '',
            date_of_birth: row.date_of_birth || null,
            membership_status: row.membership_status || 'member',
            registration_status: 'active',
            consent_privacy_policy: false,
            consent_data_processing: false,
            consent_photo_media: false,
            consent_gift_aid: false,
            submitted_at: new Date().toISOString(),
            approved_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;

        successful++;
        
        // Update row status
        const updatedData = [...csvData];
        const rowIndex = updatedData.findIndex(r => r.rowNumber === row.rowNumber);
        if (rowIndex !== -1) {
          updatedData[rowIndex].status = 'imported';
        }
        setCSVData(updatedData);

      } catch (error: any) {
        console.error('Error importing member:', error);
        failed++;
        
        // Update row status to failed
        const updatedData = [...csvData];
        const rowIndex = updatedData.findIndex(r => r.rowNumber === row.rowNumber);
        if (rowIndex !== -1) {
          updatedData[rowIndex].status = 'invalid';
          updatedData[rowIndex].errors.push(error.message || 'Failed to import');
        }
        setCSVData(updatedData);
      }

      setCSVImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    setCSVImportResults({ successful, failed, duplicates });
    setCSVImporting(false);

    if (successful > 0) {
      toast({
        title: t('ministryMembersManager', 'importCompleted', 'Import completed'),
        description: t('ministryMembersManager', 'successfullyImportedX', 'Successfully imported {count} members').replace('{count}', String(successful)),
      });
      loadMembers(); // Reload members list
    }
  };

  const downloadCSVTemplate = () => {
    const template = [
      'name,email,phone,city,country,gender,date_of_birth,membership_status',
      'John Doe,john@example.com,+1234567890,Lagos,Nigeria,Male,1990-05-12,member',
      'Jane Smith,jane@example.com,+0987654321,Accra,Ghana,Female,1988-11-03,visitor',
    ].join('\n');
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'member_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMembersToCSV = () => {
    const csvEscape = (val: any): string => {
      const s = (val ?? '').toString();
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      'Name', 'Email', 'Phone', 'Gender', 'Date of Birth', 'City', 'Country',
      'Membership Status', 'Role', 'Leader', 'Gift Aid Consent', 'Joined Date', 'Last Active', 'Activity Score'
    ];
    const rows = filteredMembers.map(member => [
      member.user_full_name || '',
      member.user_email || '',
      member.user_phone || '',
      member.gender || '',
      member.date_of_birth || '',
      member.city || '',
      member.country || '',
      member.membership_status || '',
      member.role || '',
      member.is_leader ? 'Yes' : 'No',
      member.consent_gift_aid ? 'Yes' : 'No',
      member.joined_at ? new Date(member.joined_at).toLocaleDateString() : '',
      member.last_active ? new Date(member.last_active).toLocaleDateString() : '',
      (member.activity_score ?? 0).toString()
    ]);

    const csvContent = [
      headers.map(csvEscape).join(','),
      ...rows.map(row => row.map(csvEscape).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ministry_members_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Broadcast Messaging Functions
  const handleBroadcastChannelToggle = (channel: keyof BroadcastMessage['channels']) => {
    setBroadcastForm({
      ...broadcastForm,
      channels: {
        ...broadcastForm.channels,
        [channel]: !broadcastForm.channels[channel]
      }
    });
  };

  const sendBroadcastMessage = async () => {
    if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) {
      toast({
        title: t('ministryMembersManager', 'error', 'Error'),
        description: t('ministryMembersManager', 'titleAndMessageRequired', 'Title and message are required'),
        variant: 'destructive'
      });
      return;
    }

    const selectedChannels = Object.entries(broadcastForm.channels)
      .filter(([_, enabled]) => enabled)
      .map(([channel]) => channel);

    if (selectedChannels.length === 0) {
      toast({
        title: t('ministryMembersManager', 'error', 'Error'),
        description: t('ministryMembersManager', 'selectAtLeastOneChannel', 'Select at least one channel'),
        variant: 'destructive'
      });
      return;
    }

    setSendingBroadcast(true);
    
    const results = {
      success: [] as string[],
      failed: [] as string[]
    };

    try {
      // Get target members based on selection
      let targetMembers = members;
      if (selectedMembers.length > 0) {
        targetMembers = members.filter(m => selectedMembers.includes(m.id));
      }

      // Save to broadcast_notifications table
      const broadcastData = {
        ministry_id: ministryId,
        title: broadcastForm.title,
        message: broadcastForm.message,
        sender_name: broadcastForm.senderName.trim() || undefined,
        channel: selectedChannels.join(','),
        target_audience: selectedMembers.length > 0 ? 'selected' : broadcastForm.targetAudience,
        target_member_ids: selectedMembers.length > 0 ? selectedMembers : null,
        status: broadcastForm.isScheduled ? 'scheduled' : 'sent',
        scheduled_at: broadcastForm.isScheduled ? broadcastForm.scheduledAt : null,
        sent_at: !broadcastForm.isScheduled ? new Date().toISOString() : null,
        created_by: user?.id,
        created_at: new Date().toISOString()
      };

      const { error: broadcastError } = await supabase
        .from('broadcast_notifications')
        .insert(broadcastData);

      if (broadcastError) throw broadcastError;

      // If not scheduled, send immediately via unified notify()
      if (!broadcastForm.isScheduled) {
        try {
          await notify({
            type: 'leader_broadcast',
            title: broadcastForm.title,
            body: broadcastForm.message,
            ministryId,
            senderName: broadcastForm.senderName.trim() || undefined,
          });
          results.success.push('Push', 'Email', 'In-App');
        } catch (err) {
          console.error('Broadcast notification error:', err);
          results.failed.push('Notifications');
        }
      }

      const successMsg = results.success.length > 0
        ? t('ministryMembersManager', 'sentViaX', 'Sent via: {channels}').replace('{channels}', results.success.join(', '))
        : '';
      const failedMsg = results.failed.length > 0
        ? t('ministryMembersManager', 'failedX', ' | Failed: {channels}').replace('{channels}', results.failed.join(', '))
        : '';

      toast({
        title: t('ministryMembersManager', 'success', 'Success'),
        description: broadcastForm.isScheduled
          ? t('ministryMembersManager', 'broadcastScheduledSuccessfully', 'Broadcast scheduled successfully')
          : t('ministryMembersManager', 'broadcastSentToXMembers', 'Broadcast sent to {count} members. {status}').replace('{count}', String(targetMembers.length)).replace('{status}', `${successMsg}${failedMsg}`),
      });

      // Reset form
      setBroadcastForm({
        title: '',
        message: '',
        senderName: '',
        channels: {
          push: false,
          whatsapp: false,
          zalo: false,
          inapp: true
        },
        targetAudience: 'all',
        scheduledAt: '',
        isScheduled: false
      });
      setSelectedMembers([]);
      setShowBroadcastModal(false);

    } catch (error: any) {
      toast({
        title: t('ministryMembersManager', 'errorSendingBroadcast', 'Error sending broadcast'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSendingBroadcast(false);
    }
  };

  // ---- Role management -----------------------------------------------------
  const myRole: MinistryRole | null = (() => {
    const mine = members.find((m) => m.user_id === user?.id);
    return resolveMinistryRole({
      userId: user?.id,
      ownerId,
      leaderId,
      memberRole: mine?.role,
      memberIsLeader: mine?.is_leader,
    });
  })();
  const canManageRoles = roleCan(myRole, 'manage_roles');

  // Stats computed from the merged member list (auth members + active QR registrants),
  // so the cards always match the list below — not the RPC, which counts only group members.
  const memberStats = React.useMemo(() => {
    const total = members.length;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let active = 0, newThisMonth = 0, scoreSum = 0;
    members.forEach((m) => {
      const last = m.last_active ? new Date(m.last_active) : null;
      if (last && last >= thirtyDaysAgo) active++;
      const joined = m.joined_at ? new Date(m.joined_at) : null;
      if (joined && joined >= startOfMonth) newThisMonth++;
      scoreSum += (m.activity_score || 0);
    });
    return { total, active, newThisMonth, avgScore: total > 0 ? scoreSum / total : 0 };
  }, [members]);

  const isOwnerMember = (m: any): boolean =>
    (!!ownerId && m.user_id === ownerId) || normaliseRole(m.role, m.is_leader) === 'owner';

  const canEditMemberRole = (m: any): boolean =>
    canManageRoles && !isOwnerMember(m) && m.user_id !== user?.id && (!m.is_registrant || m.has_account);

  const openRoleModal = (m: any) => {
    setSelectedMember(m);
    setSelectedRole(normaliseRole(m.role, m.is_leader));
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    if (!selectedMember) return;
    if (!canEditMemberRole(selectedMember)) {
      toast({ title: t('ministryMembersManager', 'notAllowed', 'Not allowed'), description: t('ministryMembersManager', 'cannotChangeRole', 'You cannot change this member\u2019s role.'), variant: 'destructive' });
      return;
    }
    if (selectedMember.is_registrant && !selectedMember.has_account) {
      toast({ title: t('ministryMembersManager', 'noAccountYet', 'No account yet'), description: t('ministryMembersManager', 'registeredWithoutAccount', 'This member registered without an app account. They need to sign in once before they can hold a role.'), variant: 'destructive' });
      return;
    }
    const cols = roleToMemberColumns(selectedRole as MinistryRole);
    const uid = selectedMember.user_id;
    setSavingRole(true);
    try {
      // Primary: ministry_group_members drives the member list view + this screen's
      // permission checks. Create the row if the person has none yet (e.g. a QR
      // registrant being promoted), otherwise update it.
      const { data: existingGroup } = await supabase
        .from('ministry_group_members')
        .select('id')
        .eq('ministry_id', ministryId)
        .eq('user_id', uid)
        .limit(1);
      if (existingGroup && existingGroup.length > 0) {
        const { error } = await supabase
          .from('ministry_group_members')
          .update({ role: cols.role, is_leader: cols.is_leader, group_id: ministryId })
          .eq('id', existingGroup[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ministry_group_members')
          .insert({
            ministry_id: ministryId,
            group_id: ministryId,
            user_id: uid,
            role: cols.role,
            is_leader: cols.is_leader,
            joined_at: new Date().toISOString(),
          });
        if (error) throw error;
      }

      // Mirror to ministry_members (used by some permission checks, e.g. Gift Aid).
      // Best-effort so a stricter schema there can't fail the whole promotion.
      try {
        const { data: existingMember } = await supabase
          .from('ministry_members')
          .select('id')
          .eq('ministry_id', ministryId)
          .eq('user_id', uid)
          .limit(1);
        if (existingMember && existingMember.length > 0) {
          await supabase
            .from('ministry_members')
            .update({ role: cols.role, is_leader: cols.is_leader })
            .eq('id', existingMember[0].id);
        } else {
          await supabase
            .from('ministry_members')
            .insert({ ministry_id: ministryId, user_id: uid, role: cols.role, is_leader: cols.is_leader });
        }
      } catch (mirrorErr) {
        console.warn('ministry_members mirror skipped:', mirrorErr);
      }

      setMembers((prev) => prev.map((m) =>
        m.user_id === uid ? { ...m, role: cols.role, is_leader: cols.is_leader, is_registrant: false } : m,
      ));
      toast({
        title: t('ministryMembersManager', 'roleUpdated', 'Role updated'),
        description: t('ministryMembersManager', 'memberIsNowRole', '{name} is now {role}.')
          .replace('{name}', selectedMember.user_full_name || t('ministryMembersManager', 'member', 'Member'))
          .replace('{role}', roleLabel(selectedRole as MinistryRole)),
      });
      setShowRoleModal(false);
    } catch (err: any) {
      toast({ title: t('ministryMembersManager', 'error', 'Error'), description: err.message || t('ministryMembersManager', 'failedToUpdateRole', 'Failed to update role'), variant: 'destructive' });
    } finally {
      setSavingRole(false);
    }
  };

  // Filter members based on search and role
  const filteredMembers = members.filter(member => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      member.user_full_name?.toLowerCase().includes(searchLower) ||
      member.user_email?.toLowerCase().includes(searchLower) ||
      member.user_phone?.includes(searchTerm);
    
    const matchesRole = roleFilter === 'all' || member.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const getStatusBadgeColor = (status: CSVImportRow['status']) => {
    switch (status) {
      case 'valid':
        return 'bg-green-100 text-green-800';
      case 'invalid':
        return 'bg-red-100 text-red-800';
      case 'duplicate':
        return 'bg-yellow-100 text-yellow-800';
      case 'imported':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: CSVImportRow['status']) => {
    switch (status) {
      case 'valid':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'duplicate':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'imported':
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('ministryMembersManager', 'ministryMembers', 'Ministry Members')}</h2>
          <p className="text-gray-600">{t('ministryMembersManager', 'manageAndCommunicate', 'Manage and communicate with your ministry members')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setShowCSVImportModal(true)}
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {t('ministryMembersManager', 'importCsv', 'Import CSV')}
          </Button>
          <Button
            onClick={exportMembersToCSV}
            variant="outline"
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            {t('ministryMembersManager', 'export', 'Export')}
          </Button>
          <Button
            onClick={() => setShowBroadcastModal(true)}
            variant="outline"
            className="gap-2"
            disabled={members.length === 0}
          >
            <Radio className="h-4 w-4" />
            {t('ministryMembersManager', 'broadcast', 'Broadcast')}
          </Button>
          <Button onClick={() => setShowInviteModal(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {t('ministryMembersManager', 'inviteMember', 'Invite Member')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('ministryMembersManager', 'totalMembers', 'Total Members')}</p>
                <p className="text-2xl font-bold">{members.length}</p>
              </div>
              <Users className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('ministryMembersManager', 'activeMembers', 'Active Members')}</p>
                <p className="text-2xl font-bold text-green-600">
                  {memberStats.active}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('ministryMembersManager', 'newThisMonth', 'New This Month')}</p>
                <p className="text-2xl font-bold text-blue-600">
                  {memberStats.newThisMonth}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('ministryMembersManager', 'avgActivityScore', 'Avg Activity Score')}</p>
                <p className="text-2xl font-bold text-amber-600">
                  {memberStats.avgScore.toFixed(1)}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('ministryMembersManager', 'searchMembersPlaceholder', 'Search members by name, email, or phone...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('ministryMembersManager', 'filterByRole', 'Filter by role')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministryMembersManager', 'allRoles', 'All Roles')}</SelectItem>
                {ROLES.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Selected Members Actions */}
      {selectedMembers.length > 0 && (
        <Alert>
          <AlertDescription className="flex items-center justify-between">
            <span>{t('ministryMembersManager', 'membersSelected', '{count} member(s) selected').replace('{count}', String(selectedMembers.length))}</span>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowBroadcastModal(true)}
                size="sm"
                variant="outline"
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {t('ministryMembersManager', 'broadcastToSelected', 'Broadcast to Selected')}
              </Button>
              <Button
                onClick={() => setSelectedMembers([])}
                size="sm"
                variant="ghost"
              >
                {t('ministryMembersManager', 'clearSelection', 'Clear Selection')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t('ministryMembersManager', 'membersCount', 'Members ({count})').replace('{count}', String(filteredMembers.length))}</span>
            <Button
              onClick={() => {
                if (selectedMembers.length === filteredMembers.length) {
                  setSelectedMembers([]);
                } else {
                  setSelectedMembers(filteredMembers.map(m => m.id));
                }
              }}
              variant="ghost"
              size="sm"
            >
              {selectedMembers.length === filteredMembers.length ? t('ministryMembersManager', 'deselectAll', 'Deselect All') : t('ministryMembersManager', 'selectAll', 'Select All')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredMembers.map(member => (
              <div
                key={member.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                  selectedMembers.includes(member.id)
                    ? 'bg-purple-50 border-purple-300'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(member.id)}
                    onChange={() => {
                      setSelectedMembers(prev =>
                        prev.includes(member.id)
                          ? prev.filter(id => id !== member.id)
                          : [...prev, member.id]
                      );
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">
                        {member.user_full_name || t('ministryMembersManager', 'na', 'N/A')}
                      </p>
                      {member.is_leader && (
                        <Badge variant="default" className="gap-1">
                          <Crown className="h-3 w-3" />
                          {t('ministryMembersManager', 'leader', 'Leader')}
                        </Badge>
                      )}
                      <Badge variant="secondary">{member.role}</Badge>
                      {member.is_registrant && (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                          {t('ministryMembersManager', 'registered', 'Registered')}
                        </Badge>
                      )}
                      {member.inbox_access && (
                        <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 gap-1 text-xs">
                          <MessageSquare className="h-3 w-3" />
                          {t('ministryMembersManager', 'inboxAccess', 'Inbox Access')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {member.user_email || t('ministryMembersManager', 'noEmail', 'No email')}
                      </span>
                      {member.user_phone && (
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          {member.user_phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {t('ministryMembersManager', 'scoreLabel', 'Score:')} {member.activity_score}
                      </span>
                    </div>
                    {(member.membership_status || member.city || member.country || member.consent_gift_aid) && (
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        {member.membership_status && (
                          <span className="capitalize">{member.membership_status}</span>
                        )}
                        {(member.city || member.country) && (
                          <span>{[member.city, member.country].filter(Boolean).join(', ')}</span>
                        )}
                        {member.consent_gift_aid && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                            {t('ministryMembersManager', 'giftAidCheck', 'Gift Aid ✓')}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!member.is_leader && (
                    <Button
                      onClick={async () => {
                        const newVal = !member.inbox_access;
                        const { error } = await supabase
                          .from('ministry_members')
                          .update({ inbox_access: newVal })
                          .eq('ministry_id', ministryId)
                          .eq('user_id', member.user_id);
                        if (!error) {
                          setMembers(prev => prev.map(m =>
                            m.user_id === member.user_id ? { ...m, inbox_access: newVal } : m
                          ));
                          toast({
                            title: newVal
                              ? t('ministryMembersManager', 'inboxAccessGranted', 'Inbox access granted')
                              : t('ministryMembersManager', 'inboxAccessRevoked', 'Inbox access revoked'),
                            description: (newVal
                              ? t('ministryMembersManager', 'canNowAccessInbox', '{name} can now access the Evangelism Inbox.')
                              : t('ministryMembersManager', 'canNoLongerAccessInbox', '{name} can no longer access the Evangelism Inbox.')
                            ).replace('{name}', member.user_full_name || t('ministryMembersManager', 'member', 'Member')),
                          });
                        }
                      }}
                      variant="ghost"
                      size="sm"
                      title={member.inbox_access ? t('ministryMembersManager', 'revokeInboxAccess', 'Revoke inbox access') : t('ministryMembersManager', 'grantInboxAccess', 'Grant inbox access')}
                      className={member.inbox_access ? 'text-indigo-600 hover:text-indigo-800' : 'text-gray-400 hover:text-indigo-600'}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  )}
                  {canEditMemberRole(member) && (
                    <Button
                      onClick={() => openRoleModal(member)}
                      variant="ghost"
                      size="sm"
                      title={t('ministryMembersManager', 'manageRoleTitle', 'Manage role')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {filteredMembers.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>{t('ministryMembersManager', 'noMembersFound', 'No members found')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CSV Import Modal */}
      <Dialog open={showRoleModal} onOpenChange={setShowRoleModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ministryMembersManager', 'manageRoleTitle', 'Manage role')}</DialogTitle>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{selectedMember.user_full_name || t('ministryMembersManager', 'member', 'Member')}</p>
                <p className="text-xs text-gray-500">{selectedMember.user_email}</p>
              </div>
              <div>
                <Label>{t('ministryMembersManager', 'role', 'Role')}</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {ROLE_DESCRIPTIONS[(selectedRole as MinistryRole)] || ''}
                </p>
              </div>
              <p className="text-xs text-gray-400">
                {t('ministryMembersManager', 'ownerOnlyNote', 'Only the owner can delete the ministry or transfer ownership; those aren’t granted by any role here.')}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRoleModal(false)} disabled={savingRole}>
                  {t('ministryMembersManager', 'cancel', 'Cancel')}
                </Button>
                <Button onClick={handleSaveRole} disabled={savingRole}>
                  {savingRole ? t('ministryMembersManager', 'saving', 'Saving…') : t('ministryMembersManager', 'saveRole', 'Save role')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCSVImportModal} onOpenChange={setShowCSVImportModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t('ministryMembersManager', 'importMembersFromCsv', 'Import Members from CSV')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Instructions */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">{t('ministryMembersManager', 'csvFormatRequirements', 'CSV Format Requirements:')}</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>{t('ministryMembersManager', 'requiredColumns', 'Required columns: name, email')}</li>
                  <li>{t('ministryMembersManager', 'optionalColumn', 'Optional column: phone')}</li>
                  <li>{t('ministryMembersManager', 'firstRowHeaders', 'First row must contain column headers')}</li>
                  <li>{t('ministryMembersManager', 'fileMustBeCsv', 'File must be in CSV format')}</li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* Download Template */}
            <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
              <div>
                <p className="font-semibold text-blue-900">{t('ministryMembersManager', 'needATemplate', 'Need a template?')}</p>
                <p className="text-sm text-blue-700">{t('ministryMembersManager', 'downloadTemplateToStart', 'Download our CSV template to get started')}</p>
              </div>
              <Button onClick={downloadCSVTemplate} variant="outline" className="gap-2">
                <FileDown className="h-4 w-4" />
                {t('ministryMembersManager', 'downloadTemplate', 'Download Template')}
              </Button>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>{t('ministryMembersManager', 'selectCsvFile', 'Select CSV File')}</Label>
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVFileSelect}
                  className="flex-1"
                />
                {csvFile && (
                  <Badge variant="secondary" className="gap-2">
                    <FileText className="h-4 w-4" />
                    {csvFile.name}
                  </Badge>
                )}
              </div>
            </div>

            {/* Validation Progress */}
            {csvValidating && (
              <div className="flex items-center justify-center gap-3 p-4 bg-gray-50 rounded-lg">
                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                <p className="text-sm text-gray-600">{t('ministryMembersManager', 'validatingCsvData', 'Validating CSV data...')}</p>
              </div>
            )}

            {/* Import Progress */}
            {csvImporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{t('ministryMembersManager', 'importingMembers', 'Importing members...')}</span>
                  <span className="font-semibold">{csvImportProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${csvImportProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Import Results */}
            {csvImportResults.successful > 0 && !csvImporting && (
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <p className="font-semibold text-green-900">{t('ministryMembersManager', 'successful', 'Successful')}</p>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {csvImportResults.successful}
                  </p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <p className="font-semibold text-red-900">{t('ministryMembersManager', 'failed', 'Failed')}</p>
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    {csvImportResults.failed}
                  </p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <p className="font-semibold text-yellow-900">{t('ministryMembersManager', 'duplicates', 'Duplicates')}</p>
                  </div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {csvImportResults.duplicates}
                  </p>
                </div>
              </div>
            )}

            {/* CSV Data Preview */}
            {csvData.length > 0 && !csvImporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('ministryMembersManager', 'previewValidation', 'Preview & Validation')}</Label>
                  <Badge variant="secondary">
                    {t('ministryMembersManager', 'validTotal', '{valid} valid / {total} total')
                      .replace('{valid}', String(csvData.filter(r => r.status === 'valid' || r.status === 'imported').length))
                      .replace('{total}', String(csvData.length))}
                  </Badge>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold">{t('ministryMembersManager', 'rowHeader', 'Row')}</th>
                          <th className="px-4 py-2 text-left font-semibold">{t('ministryMembersManager', 'statusHeader', 'Status')}</th>
                          <th className="px-4 py-2 text-left font-semibold">{t('ministryMembersManager', 'nameHeader', 'Name')}</th>
                          <th className="px-4 py-2 text-left font-semibold">{t('ministryMembersManager', 'emailHeader', 'Email')}</th>
                          <th className="px-4 py-2 text-left font-semibold">{t('ministryMembersManager', 'phoneHeader', 'Phone')}</th>
                          <th className="px-4 py-2 text-left font-semibold">{t('ministryMembersManager', 'issuesHeader', 'Issues')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.map((row, index) => (
                          <tr key={index} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-2">{row.rowNumber}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(row.status)}
                                <Badge
                                  variant="secondary"
                                  className={getStatusBadgeColor(row.status)}
                                >
                                  {row.status}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-4 py-2">{row.name}</td>
                            <td className="px-4 py-2">{row.email}</td>
                            <td className="px-4 py-2">{row.phone || '-'}</td>
                            <td className="px-4 py-2">
                              {row.errors.length > 0 ? (
                                <div className="text-xs text-red-600">
                                  {row.errors.map((error, i) => (
                                    <div key={i}>• {error}</div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setShowCSVImportModal(false);
                setCSVFile(null);
                setCSVData([]);
                setCSVImportResults({ successful: 0, failed: 0, duplicates: 0 });
              }}
              variant="outline"
            >
              {t('ministryMembersManager', 'close', 'Close')}
            </Button>
            <Button
              onClick={importCSVMembers}
              disabled={
                csvImporting ||
                csvValidating ||
                csvData.length === 0 ||
                csvData.filter(r => r.status === 'valid').length === 0
              }
              className="gap-2"
            >
              {csvImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('ministryMembersManager', 'importingEllipsis', 'Importing...')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {t('ministryMembersManager', 'importXMembers', 'Import {count} Members').replace('{count}', String(csvData.filter(r => r.status === 'valid').length))}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Broadcast Messaging Modal */}
      <Dialog open={showBroadcastModal} onOpenChange={setShowBroadcastModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              {t('ministryMembersManager', 'broadcastMessageToMembers', 'Broadcast Message to Members')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 px-6 py-4 overflow-y-auto flex-1">
            {/* Target Audience Info */}
            <Alert>
              <MessageSquare className="h-4 w-4" />
              <AlertDescription>
                {selectedMembers.length > 0 ? (
                  <span>
                    {t('ministryMembersManager', 'sendingToSelectedBefore', 'Sending to ')}<strong>{selectedMembers.length}</strong>{t('ministryMembersManager', 'sendingToSelectedAfter', ' selected member(s)')}
                  </span>
                ) : (
                  <span>
                    {t('ministryMembersManager', 'sendingToAllBefore', 'Sending to ')}<strong>{t('ministryMembersManager', 'allX', 'all {count}').replace('{count}', String(members.length))}</strong>{t('ministryMembersManager', 'sendingToAllAfter', ' ministry members')}
                  </span>
                )}
              </AlertDescription>
            </Alert>

            {/* Sender Identity */}
            <div className="space-y-2">
              <Label>{t('ministryMembersManager', 'senderIdentity', 'Sender Identity')}</Label>
              <p className="text-xs text-gray-500">
                {t('ministryMembersManager', 'senderIdentityHint', 'Who should this broadcast appear to come from? Leave blank to use the default ministry name.')}
              </p>
              <Input
                placeholder={t('ministryMembersManager', 'senderIdentityPlaceholder', 'e.g., Grace Church, Youth Ministry, Pastor John...')}
                value={broadcastForm.senderName}
                onChange={(e) =>
                  setBroadcastForm({ ...broadcastForm, senderName: e.target.value })
                }
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {['Ministry', 'Youth Ministry', 'Worship Team', 'Prayer Team', 'Leadership'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBroadcastForm({ ...broadcastForm, senderName: preset })}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      broadcastForm.senderName === preset
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                {broadcastForm.senderName && !['Ministry', 'Youth Ministry', 'Worship Team', 'Prayer Team', 'Leadership'].includes(broadcastForm.senderName) && (
                  <button
                    type="button"
                    onClick={() => setBroadcastForm({ ...broadcastForm, senderName: '' })}
                    className="text-xs px-3 py-1 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500"
                  >
                    {t('ministryMembersManager', 'clearChip', '✕ Clear')}
                  </button>
                )}
              </div>
            </div>

            {/* Message Title */}
            <div className="space-y-2">
              <Label>{t('ministryMembersManager', 'messageTitle', 'Message Title *')}</Label>
              <Input
                placeholder={t('ministryMembersManager', 'enterBroadcastTitle', 'Enter broadcast title')}
                value={broadcastForm.title}
                onChange={(e) =>
                  setBroadcastForm({ ...broadcastForm, title: e.target.value })
                }
              />
            </div>

            {/* Message Content */}
            <div className="space-y-2">
              <Label>{t('ministryMembersManager', 'messageContent', 'Message Content *')}</Label>
              <Textarea
                placeholder={t('ministryMembersManager', 'enterYourMessage', 'Enter your message here...')}
                rows={6}
                value={broadcastForm.message}
                onChange={(e) =>
                  setBroadcastForm({ ...broadcastForm, message: e.target.value })
                }
              />
              <p className="text-xs text-gray-500">
                {t('ministryMembersManager', 'charactersCount', '{count} characters').replace('{count}', String(broadcastForm.message.length))}
              </p>
            </div>

            {/* Delivery Channels */}
            <div className="space-y-3">
              <Label>{t('ministryMembersManager', 'deliveryChannels', 'Delivery Channels *')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium">{t('ministryMembersManager', 'inApp', 'In-App')}</span>
                  </div>
                  <Switch
                    checked={broadcastForm.channels.inapp}
                    onCheckedChange={() => handleBroadcastChannelToggle('inapp')}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">{t('ministryMembersManager', 'push', 'Push')}</span>
                  </div>
                  <Switch
                    checked={broadcastForm.channels.push}
                    onCheckedChange={() => handleBroadcastChannelToggle('push')}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">WhatsApp</span>
                  </div>
                  <Switch
                    checked={broadcastForm.channels.whatsapp}
                    onCheckedChange={() => handleBroadcastChannelToggle('whatsapp')}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Zalo</span>
                  </div>
                  <Switch
                    checked={broadcastForm.channels.zalo}
                    onCheckedChange={() => handleBroadcastChannelToggle('zalo')}
                  />
                </div>
              </div>
            </div>

            {/* Schedule Option */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <div>
                  <p className="font-medium text-sm">{t('ministryMembersManager', 'scheduleForLater', 'Schedule for later')}</p>
                  <p className="text-xs text-gray-600">{t('ministryMembersManager', 'sendAtSpecificTime', 'Send at a specific date and time')}</p>
                </div>
              </div>
              <Switch
                checked={broadcastForm.isScheduled}
                onCheckedChange={(checked) =>
                  setBroadcastForm({ ...broadcastForm, isScheduled: checked })
                }
              />
            </div>

            {/* Schedule DateTime */}
            {broadcastForm.isScheduled && (
              <div className="space-y-2">
                <Label>{t('ministryMembersManager', 'scheduleDateTime', 'Schedule Date & Time')}</Label>
                <Input
                  type="datetime-local"
                  value={broadcastForm.scheduledAt}
                  onChange={(e) =>
                    setBroadcastForm({ ...broadcastForm, scheduledAt: e.target.value })
                  }
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
            )}

            {/* Preview */}
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm font-semibold text-purple-900 mb-2">{t('ministryMembersManager', 'preview', 'Preview')}</p>
              <div className="bg-white p-3 rounded border space-y-2">
                {broadcastForm.senderName && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      {t('ministryMembersManager', 'fromX', 'From: {name}').replace('{name}', broadcastForm.senderName)}
                    </span>
                  </div>
                )}
                <p className="font-semibold">{broadcastForm.title || t('ministryMembersManager', 'messageTitlePlaceholder', 'Message Title')}</p>
                <p className="text-sm text-gray-700">
                  {broadcastForm.message || t('ministryMembersManager', 'messageContentPlaceholder', 'Your message content will appear here...')}
                </p>
              </div>
              {broadcastForm.senderName && (
                <p className="text-xs text-purple-700 mt-2 flex items-center gap-1">
                  <Send className="h-3 w-3" />
                  {t('ministryMembersManager', 'sendingAs', 'Sending as ')}<strong className="ml-0.5">{broadcastForm.senderName}</strong>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-gray-50 shrink-0">
            <Button
              onClick={() => {
                setShowBroadcastModal(false);
                setBroadcastForm({
                  title: '',
                  message: '',
                  senderName: '',
                  channels: {
                    push: false,
                    whatsapp: false,
                    zalo: false,
                    inapp: true
                  },
                  targetAudience: 'all',
                  scheduledAt: '',
                  isScheduled: false
                });
              }}
              variant="outline"
            >
              {t('ministryMembersManager', 'cancel', 'Cancel')}
            </Button>
            <Button
              onClick={sendBroadcastMessage}
              disabled={sendingBroadcast}
              className="gap-2"
            >
              {sendingBroadcast ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('ministryMembersManager', 'sendingEllipsis', 'Sending...')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {broadcastForm.isScheduled ? t('ministryMembersManager', 'scheduleBroadcast', 'Schedule Broadcast') : t('ministryMembersManager', 'sendBroadcast', 'Send Broadcast')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Modal - Keep existing implementation */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent>
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>{t('ministryMembersManager', 'inviteNewMember', 'Invite New Member')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('ministryMembersManager', 'emailAddress', 'Email Address')}</Label>
              <Input
                type="email"
                placeholder="member@example.com"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t('ministryMembersManager', 'role', 'Role')}</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(value) =>
                  setInviteForm({ ...inviteForm, role: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('ministryMembersManager', 'personalMessageOptional', 'Personal Message (Optional)')}</Label>
              <Textarea
                placeholder={t('ministryMembersManager', 'addPersonalMessage', 'Add a personal message to the invitation...')}
                rows={4}
                value={inviteForm.message}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, message: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowInviteModal(false)} variant="outline">
              {t('ministryMembersManager', 'cancel', 'Cancel')}
            </Button>
            <Button
              onClick={async () => {
                // Implement invite logic
                toast({
                  title: t('ministryMembersManager', 'invitationSent', 'Invitation sent'),
                  description: t('ministryMembersManager', 'invitationSentToX', 'Invitation sent to {email}').replace('{email}', inviteForm.email),
                });
                setShowInviteModal(false);
                setInviteForm({ email: '', role: 'member', message: '' });
              }}
              disabled={!inviteForm.email}
            >
              {t('ministryMembersManager', 'sendInvitation', 'Send Invitation')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryMembersManager;