import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateReferralCode,
  getReferralStats,
  copyReferralLink,
  shareReferral,
  type ReferralCode,
  type ReferralStats,
} from '@/lib/referralService';
import { Button } from '@/components/ui/button';
import { Copy, Share2, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const ReferralGenerator: React.FC = () => {
  const { user } = useAuth();
  const [code, setCode] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Generate or get existing referral code
      const { code: referralCode, error: codeError } = await generateReferralCode(user.id);
      if (codeError) {
        console.error('Code generation error:', codeError);
        toast.error('Failed to generate referral code');
      } else {
        setCode(referralCode);
      }

      // Get referral stats
      const { stats: statsData, error: statsError } = await getReferralStats(user.id);
      if (statsError) {
        console.error('Stats error:', statsError);
      } else {
        setStats(statsData);
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;

    const success = await copyReferralLink(code.code);
    if (success) {
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    if (!code || !user) return;

    const success = await shareReferral(code.code, user.user_metadata?.full_name);
    if (!success) {
      // Fallback to copy
      handleCopy();
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-8 text-white flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-8 text-white">
      <h3 className="text-2xl font-bold mb-2">Share Your Faith</h3>
      <p className="opacity-90 mb-6">Invite others to begin their spiritual journey</p>
      
      <div className="bg-white/20 backdrop-blur rounded-lg p-6 mb-6">
        <div className="text-center">
          <p className="text-sm opacity-90 mb-2">Your Referral Code</p>
          <p className="text-3xl font-bold tracking-wider mb-4">
            {code?.code || 'LOADING...'}
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-center">
            <Button
              onClick={handleCopy}
              variant="secondary"
              className="flex-1 max-w-[200px]"
              disabled={!code}
            >
              {copied ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </>
              )}
            </Button>
            <Button
              onClick={handleShare}
              variant="secondary"
              className="flex-1 max-w-[200px]"
              disabled={!code}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold">{stats?.totalReferrals || 0}</p>
          <p className="text-sm opacity-90">Referred</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{stats?.activeReferrals || 0}</p>
          <p className="text-sm opacity-90">Active</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{stats?.totalXPEarned || 0}</p>
          <p className="text-sm opacity-90">XP Earned</p>
        </div>
      </div>
    </div>
  );
};