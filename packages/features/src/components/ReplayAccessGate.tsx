import React from 'react';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Button } from '@rekindle/ui/button';
import { Card, CardContent } from '@rekindle/ui/card';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { Lock, Heart, Sparkles } from 'lucide-react';

interface ReplayAccessGateProps {
  canStream?: boolean;
  canDownload?: boolean;
  is_ministry?: boolean;
  replayType?: 'meeting' | 'channel' | 'session';
  replayTitle?: string;
  children: React.ReactNode;
}

export default function ReplayAccessGate({
  canStream,
  is_ministry = false,
  replayType = 'meeting',
  children,
}: ReplayAccessGateProps) {
  const entitlements = useUserEntitlements();
  const hasStreamAccess = canStream !== undefined ? canStream : entitlements.canAccessReplays;

  if (!hasStreamAccess) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Alert className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
          <Lock className="h-5 w-5 text-purple-600" />
          <AlertDescription className="ml-2">
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-purple-900 text-lg">Partner Feature</p>
                <p className="text-purple-700 mt-2">
                  Replay access is available to ReKindle BC Partners.
                  Become a Partner with any donation to unlock replays and more.
                </p>
              </div>
              <Card className="bg-white">
                <CardContent className="p-4">
                  <p className="font-semibold text-gray-900 mb-2">Partner benefits include:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {[
                      'Access to meeting & channel replays',
                      'Full devotional library',
                      'Live channel creation',
                      'Book summaries',
                      'WhatsApp devotionals & affirmations',
                    ].map(b => (
                      <li key={b} className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Button
                className="bg-gradient-to-r from-purple-600 to-rose-500 hover:from-purple-700 hover:to-rose-600 text-white w-full"
                onClick={() => window.dispatchEvent(new CustomEvent('openDonate'))}
              >
                <Heart className="h-4 w-4 mr-2" />
                Become a Partner
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
