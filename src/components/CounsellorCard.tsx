import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Calendar, Star, Users, Mic, Globe, CheckCircle, DollarSign, Lock } from 'lucide-react';

export interface Counsellor {
  id: string;
  name: string;
  full_name?: string;
  title?: string;
  specialty?: string;
  bio?: string;
  avatar_url?: string;
  profile_image_url?: string;
  email?: string;
  phone?: string;
  is_available?: boolean;
  is_active?: boolean;
  hourly_rate?: number;
  rating?: number;
  total_sessions?: number;
  is_verified?: boolean;
  // Legacy support
  imageUrl?: string;
  specializations?: string[];
  specialization?: string[];
  languages?: string[];
  sessions?: number;
  converts?: number;
  voiceEnabled?: boolean;
}

interface Props {
  counsellor: Counsellor;
  onConnect: () => void;
  onBook: () => void;
}

export const CounsellorCard: React.FC<Props> = ({ counsellor, onConnect, onBook }) => {
  const entitlements = useUserEntitlements();
  const { t } = useLanguage();

  const name = counsellor.full_name || counsellor.name;
  const imageUrl = counsellor.profile_image_url || counsellor.avatar_url || counsellor.imageUrl || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c3aed&color=fff`;
  const rating = counsellor.rating || 0;
  const sessions = counsellor.total_sessions || counsellor.sessions || counsellor.converts || 0;
  const specializations = counsellor.specialization || 
    (counsellor.specialty ? [counsellor.specialty] : (counsellor.specializations || []));
  const isAvailable = counsellor.is_available !== false && counsellor.is_active !== false;
  const isVerified = counsellor.is_verified !== false;
  const languages = counsellor.languages || ['English'];
  
  // Check if user can book counsellors (Premium+ feature)
  const canBookCounsellor = entitlements.canBookCounsellor;

  // Render stars based on rating
  const renderStars = () => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <div key={i} className="relative">
            <Star className="h-4 w-4 text-gray-300" />
            <div className="absolute inset-0 overflow-hidden w-1/2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            </div>
          </div>
        );
      } else {
        stars.push(
          <Star key={i} className="h-4 w-4 text-gray-300" />
        );
      }
    }
    return stars;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition-all duration-300 border border-gray-100">
      <div className="flex items-start gap-4">
        <div className="relative">
          <img 
            src={imageUrl} 
            alt={name}
            className="w-20 h-20 rounded-full object-cover border-4 border-purple-100"
          />
          {isAvailable && (
            <div className="absolute -bottom-1 -right-1 bg-green-500 p-1 rounded-full">
              <Mic className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-gray-900">{name}</h3>
            {isVerified && (
              <CheckCircle className="h-4 w-4 text-blue-500 fill-blue-500" />
            )}
          </div>
          {counsellor.title && (
            <p className="text-sm text-purple-600 font-medium">{counsellor.title}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-0.5">
              {renderStars()}
            </div>
            <span className="text-sm text-gray-600">
              {rating > 0 ? rating.toFixed(1) : t('counsellorCard', 'new', 'New')}
            </span>
            {sessions > 0 && (
              <span className="text-sm text-gray-400">
                {t('counsellorCard', 'sessionsCount', '({count} sessions)').replace('{count}', String(sessions))}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
            {counsellor.bio || t('counsellorCard', 'defaultBio', 'Experienced spiritual counsellor ready to guide you on your journey.')}
          </p>
        </div>
      </div>
      
      {specializations.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {specializations.slice(0, 4).map(spec => (
            <span key={spec} className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
              {spec}
            </span>
          ))}
          {specializations.length > 4 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
              {t('counsellorCard', 'moreCount', '+{count} more').replace('{count}', String(specializations.length - 4))}
            </span>
          )}
        </div>
      )}
      
      <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="h-4 w-4" />
          {t('counsellorCard', 'sessionsLabel', '{count} sessions').replace('{count}', String(sessions))}
        </span>
        {counsellor.hourly_rate && counsellor.hourly_rate > 0 ? (
          <span className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            {t('counsellorCard', 'perHour', '${rate}/hr').replace('{rate}', String(counsellor.hourly_rate))}
          </span>
        ) : (
          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
            {t('counsellorCard', 'free', 'Free')}
          </Badge>
        )}
        {languages.length > 0 && (
          <span className="flex items-center gap-1">
            <Globe className="h-4 w-4" />
            {languages.slice(0, 2).join(', ')}
            {languages.length > 2 && ` +${languages.length - 2}`}
          </span>
        )}
        {!isAvailable && (
          <Badge variant="secondary" className="text-xs">{t('counsellorCard', 'unavailable', 'Unavailable')}</Badge>
        )}
      </div>
      
      <div className="mt-4 flex gap-2">
        <Button 
          onClick={() => {
            if (!canBookCounsellor) {
              toast({
                title: t('counsellorCard', 'premiumRequired', 'Premium Required'),
                description: t('counsellorCard', 'premiumRequiredDesc', 'Booking counsellors requires a Premium subscription'),
                variant: 'destructive'
              });
              return;
            }
            onBook();
          }}
          className="flex-1 bg-purple-600 hover:bg-purple-700"
          disabled={!isAvailable || !canBookCounsellor}
        >
          {!canBookCounsellor && <Lock className="h-4 w-4 mr-2" />}
          <Calendar className="h-4 w-4 mr-2" />
          {!canBookCounsellor ? t('counsellorCard', 'premiumRequired', 'Premium Required') : t('counsellorCard', 'bookSession', 'Book Session')}
        </Button>
        <Button
          onClick={onConnect}
          variant="outline"
          className="flex-1"
        >
          {t('counsellorCard', 'message', 'Message')}
        </Button>
      </div>
    </div>
  );
};

// Backward compatibility - export as MentorCard alias
export { CounsellorCard as MentorCard };
export type Mentor = Counsellor;
