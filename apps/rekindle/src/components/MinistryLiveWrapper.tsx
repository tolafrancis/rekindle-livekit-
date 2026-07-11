import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MLiveChannel } from '@/components/MLiveChannel';
import { useAuth } from '@/contexts/AuthContext';

/**
 * MinistryLiveWrapper
 * 
 * This component serves as a bridge between Ministry Space routes and MLiveChannel.
 * It extracts the ministryId from the URL, fetches the ministry data,
 * and then renders the MLiveChannel component with the same behavior as LiveChannels.
 * 
 * Architecture:
 * Route /ministries/:ministryId/live → This wrapper → Fetches ministry data → Renders MLiveChannel
 */

const MinistryLiveWrapper: React.FC = () => {
  const { ministryId } = useParams<{ ministryId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [ministryName, setMinistryName] = useState<string>('');
  const [themeColor, setThemeColor] = useState<string>('#7c3aed');
  const [isLeader, setIsLeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMinistryData = async () => {
      if (!ministryId) {
        setError('Ministry ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Fetch ministry details from ministry_groups table
        const { data: ministryData, error: ministryError } = await supabase
          .from('ministry_groups')
          .select('name, theme_color, owner_id, leader_id')
          .eq('id', ministryId)
          .single();

        if (ministryError) throw new Error('Ministry not found');
        
        setMinistryName(ministryData.name || 'Ministry');
        setThemeColor(ministryData.theme_color || '#7c3aed');
        
        // Check if user is a leader
        if (user?.id) {
          const isOwnerOrLeader = 
            ministryData.owner_id === user.id || 
            ministryData.leader_id === user.id;
          
          if (!isOwnerOrLeader) {
            // Check membership for leader role
            const { data: membership } = await supabase
              .from('ministry_memberships')
              .select('is_leader, role')
              .eq('ministry_id', ministryId)
              .eq('user_id', user.id)
              .single();
            
            setIsLeader(membership?.is_leader || membership?.role === 'leader' || membership?.role === 'admin');
          } else {
            setIsLeader(true);
          }
        }

        setError(null);
      } catch (err: any) {
        console.error('Error fetching ministry data:', err);
        setError(err.message || 'Failed to load ministry');
      } finally {
        setLoading(false);
      }
    };

    fetchMinistryData();
  }, [ministryId, user?.id]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
        <Card className="w-96">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-purple-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Loading Live Channels
            </h3>
            <p className="text-sm text-gray-500 text-center">
              Preparing your ministry live experience...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !ministryId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
        <Card className="w-96">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Unable to Load Ministry
            </h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              {error || 'Ministry not available'}
            </p>
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success: Render the MLiveChannel component (same behavior as LiveChannels)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back button header */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Ministry
          </Button>
          <span className="text-gray-400">|</span>
          <span className="font-medium">{ministryName}</span>
        </div>
      </div>
      
      {/* MLiveChannel - same structure as LiveChannels */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <MLiveChannel
          ministryId={ministryId}
          ministryName={ministryName}
          isLeader={isLeader}
          themeColor={themeColor}
        />
      </div>
    </div>
  );
};

export default MinistryLiveWrapper;
