import React, { useState, useEffect } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import {
  BookOpen, Heart, Calendar, Gift, Users, Megaphone, Star,
  Settings, BarChart3, MessageSquare, Loader2, ArrowLeft, Cake, ClipboardList, Inbox, HandCoins,
  HeartHandshake, Video, Radio, ScrollText
} from 'lucide-react';

// Import all manager components
import { MinistryOverviewDashboard } from './MinistryOverviewDashboard';
import { MinistryDevotionalsManager } from './MinistryDevotionalsManager';
import { MinistryPrayerLibraryManager } from './MinistryPrayerLibraryManager';
import { MinistryEventsManager } from './MinistryEventsManager';
import { MinistryPrayerRequestsManager } from './MinistryPrayerRequestsManager';
import { MinistryAnnouncementsManager } from './MinistryAnnouncementsManager';
import { MinistryDonationsManager } from './MinistryDonationsManager';
import { MinistryMembersManager } from './MinistryMembersManager';
import { MinistryVolunteerTeamsManager } from './MinistryVolunteerTeamsManager';
import { MinistryVideoMessagesManager } from './MinistryVideoMessagesManager';
import { MinistryTestimoniesManager } from './MinistryTestimoniesManager';
import { MinistrySettingsManager } from './MinistrySettingsManager';
import { MinistryGiftAidDashboard } from './MinistryGiftAidDashboard';
import MinistryRegistrations from './MinistryRegistrations';
import { EvangelismInbox } from './EvangelismInbox';
import { MinistryWhatsAppHub } from './MinistryWhatsAppHub';
import { MinistryBirthdayWishes } from './MinistryBirthdayWishes';
import { MinistryTranslationHub } from './MinistryTranslationHub';
import { MinistryRulesManager } from './MinistryRulesManager';

interface MinistryManagementProps {
  ministryId: string;
  onBack?: () => void;
}

interface Ministry {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  theme_color: string;
  logo_url: string;
  banner_url: string;
  welcome_message: string;
  is_public: boolean;
  join_method: string;
  social_links: any;
  brand_colors: any;
  white_label_domain: string;
  settings: any;
  member_count: number;
  created_at: string;
}

const TABS = [
  { id: 'overview',        label: 'Overview',        icon: BarChart3,     color: 'text-purple-600' },
  { id: 'devotionals',     label: 'Devotionals',     icon: BookOpen,      color: 'text-blue-600'   },
  { id: 'prayer-library',  label: 'Prayer Library',  icon: Heart,         color: 'text-pink-600'   },
  { id: 'events',          label: 'Events',          icon: Calendar,      color: 'text-green-600'  },
  { id: 'prayer-requests', label: 'Prayer Requests', icon: MessageSquare, color: 'text-amber-600'  },
  { id: 'announcements',   label: 'Announcements',   icon: Megaphone,     color: 'text-orange-600' },
  { id: 'testimonies',     label: 'Testimonies',     icon: Star,          color: 'text-yellow-600' },
  { id: 'donations',       label: 'Donations',       icon: Gift,          color: 'text-emerald-600'},
  { id: 'members',         label: 'Members',         icon: Users,         color: 'text-indigo-600' },
  { id: 'volunteers',      label: 'Volunteers',      icon: HeartHandshake, color: 'text-teal-600'   },
  { id: 'video-messages',  label: 'Video Messages',  icon: Video,         color: 'text-violet-600' },
  { id: 'translation',     label: 'Live Translation', icon: Radio,        color: 'text-indigo-600' },
  { id: 'registrations',   label: 'Registrations',   icon: ClipboardList, color: 'text-purple-600' },
  { id: 'whatsapp',        label: 'WhatsApp',        icon: MessageSquare, color: 'text-green-600'  },
  { id: 'inbox',           label: 'Inbox',           icon: Inbox,         color: 'text-cyan-600'   },
  { id: 'birthdays',       label: 'Birthdays',       icon: Cake,          color: 'text-pink-600'   },
  { id: 'rules',           label: 'Rules & Guidelines', icon: ScrollText, color: 'text-slate-600'  },
  { id: 'settings',        label: 'Settings',        icon: Settings,      color: 'text-gray-600'   },
];

export const MinistryManagement: React.FC<MinistryManagementProps> = ({
  ministryId,
  onBack
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useViewHistory<string>('ministry-management', 'overview');
  const [ministry, setMinistry] = useState<Ministry | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    loadMinistry();
    checkLeaderStatus();
  }, [ministryId]);

  const loadMinistry = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_groups')
        .select('*')
        .eq('id', ministryId)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        throw new Error('Ministry not found');
      }
      
      setMinistry(data);
    } catch (err) {
      console.error('Error loading ministry:', err);
      toast({
        title: t('ministryManagement', 'error', 'Error'),
        description: t('ministryManagement', 'failedLoadMinistry', 'Failed to load ministry details'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const checkLeaderStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_group_members')
        .select('is_leader')
        .eq('group_id', ministryId)
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setIsLeader(data?.is_leader || false);
    } catch (err) {
      console.error('Error checking leader status:', err);
      setIsLeader(false);
    }
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
  };

  const renderTabContent = () => {
    if (!ministry) return null;

    switch (activeTab) {
      case 'overview':
        return <MinistryOverviewDashboard ministryId={ministryId} onNavigate={handleTabChange} />;
      
      case 'devotionals':
        return <MinistryDevotionalsManager ministryId={ministryId} />;
      
      case 'prayer-library':
        return <MinistryPrayerLibraryManager ministryId={ministryId} />;
      
      case 'events':
        return <MinistryEventsManager ministryId={ministryId} />;
      
      case 'prayer-requests':
        return <MinistryPrayerRequestsManager ministryId={ministryId} />;
      
      case 'announcements':
        return <MinistryAnnouncementsManager ministryId={ministryId} />;
      
      case 'testimonies':
        return <MinistryTestimoniesManager ministryId={ministryId} />;
      
      case 'donations':
        return <MinistryDonationsManager ministryId={ministryId} ministryName={ministry.name} themeColor={ministry.theme_color} isLeader={isLeader} />;
      


      case 'members':
        return <MinistryMembersManager ministryId={ministryId} />;

      case 'volunteers':
        return <MinistryVolunteerTeamsManager ministryId={ministryId} />;

      case 'video-messages':
        return <MinistryVideoMessagesManager ministryId={ministryId} ministryName={ministry.name} />;

      case 'translation':
        return <MinistryTranslationHub ministryId={ministryId} ministryName={ministry.name} />;

      case 'registrations':
        return <MinistryRegistrations ministryId={ministryId} ministryName={ministry.name} />;

      case 'whatsapp':
        return (
          <MinistryWhatsAppHub
            ministryId={ministryId}
            ministryName={ministry.name}
          />
        );

      case 'inbox':
        return <EvangelismInbox ministryId={ministryId} ministryName={ministry.name} isLeader={isLeader} />;

      case 'birthdays':
        return <MinistryBirthdayWishes ministryId={ministryId} ministryName={ministry.name} />;

      case 'gift-aid':
        return (
          <MinistryGiftAidDashboard
            ministryId={ministryId}
            ministryName={ministry.name}
            themeColor={ministry.theme_color}
            countryCode={ministry.country_code}
            onGoToSettings={() => handleTabChange('settings')}
          />
        );

      case 'rules':
        return <MinistryRulesManager ministryId={ministryId} />;

      case 'settings':
        return <MinistrySettingsManager ministry={ministry} onUpdate={loadMinistry} />;
      
      default:
        return <MinistryOverviewDashboard ministryId={ministryId} onNavigate={handleTabChange} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!ministry) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-lg text-gray-600 mb-4">{t('ministryManagement', 'ministryNotFound', 'Ministry not found')}</p>
        {onBack && (
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('ministryManagement', 'goBack', 'Go Back')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <div className="flex items-center gap-3">
                {ministry.logo_url ? (
                  <img 
                    src={ministry.logo_url} 
                    alt={ministry.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: ministry.theme_color || '#7c3aed' }}
                  >
                    <span className="text-white font-semibold text-lg">
                      {ministry.name[0]}
                    </span>
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{ministry.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Badge variant="secondary">{ministry.category}</Badge>
                    <span>•</span>
                    <span>{t('ministryManagement', 'membersCount', '{count} members').replace('{count}', String(ministry.member_count || 0))}</span>
                    {isLeader && (
                      <>
                        <span>•</span>
                        <Badge className="bg-amber-100 text-amber-700">{t('ministryManagement', 'leader', 'Leader')}</Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-px">
            {(ministry?.country_code === 'GB'
              ? TABS.flatMap((item) =>
                  item.id === 'donations'
                    ? [item, { id: 'gift-aid', label: 'Gift Aid', icon: HandCoins, color: 'text-rose-600' }]
                    : [item],
                )
              : TABS
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const tabLabelKeys: Record<string, string> = {
                'overview': 'tabOverview',
                'devotionals': 'tabDevotionals',
                'prayer-library': 'tabPrayerLibrary',
                'events': 'tabEvents',
                'prayer-requests': 'tabPrayerRequests',
                'announcements': 'tabAnnouncements',
                'testimonies': 'tabTestimonies',
                'donations': 'tabDonations',
                'members': 'tabMembers',
                'volunteers': 'tabVolunteers',
                'video-messages': 'tabVideoMessages',
                'translation': 'tabLiveTranslation',
                'registrations': 'tabRegistrations',
                'whatsapp': 'tabWhatsApp',
                'inbox': 'tabInbox',
                'birthdays': 'tabBirthdays',
                'rules': 'tabRules',
                'settings': 'tabSettings',
                'gift-aid': 'tabGiftAid',
              };

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                    border-b-2 transition-colors
                    ${isActive
                      ? `border-purple-600 ${tab.color}`
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {t('ministryManagement', tabLabelKeys[tab.id] || 'tabOverview', tab.label)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default MinistryManagement;