import { Video, Sparkles, ArrowRight, Code2 } from 'lucide-react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { useLanguage } from '../LanguageContext';

// apps/developer-portal's production domain. The Pages project + DNS/Worker
// routing for this subdomain are a Cloudflare dashboard task, not code —
// see docs/api/interactive-meetings.md's "Deploying the portal" section.
const API_PORTAL_URL = 'https://developers.rekindlebc.com';

/**
 * Home-screen banner for the "Free Ministry Meetings" allowance (10 hrs/month,
 * up to 15 participants, 60 min each, no card required) — shown on both the
 * consumer app's and ministry app's Home tabs so the free tier is actually
 * discoverable, not just a gate that only appears once someone opens the
 * Create Meeting modal. Also the primary on-ramp to the standalone
 * Interactive Meetings API (apps/developer-portal).
 */
export const FreeMeetingsPromoCard: React.FC<{ onStartMeeting?: () => void }> = ({ onStartMeeting }) => {
  const { t } = useLanguage();
  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
      <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-md">
          <Video className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 flex items-center gap-1.5">
            {t('freeMeetingsPromo', 'title', 'Free Ministry Meetings')}
            <Sparkles className="h-4 w-4 text-purple-500 shrink-0" />
          </p>
          <p className="text-sm text-gray-600">
            {t('freeMeetingsPromo', 'desc', '10 hours every month, as many meetings as you like, up to 15 participants, 60 minutes each. No credit card required.')}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {onStartMeeting && (
            <Button onClick={onStartMeeting} size="sm" className="bg-purple-600 hover:bg-purple-700">
              {t('freeMeetingsPromo', 'start', 'Start a Meeting')}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          )}
          <a
            href={API_PORTAL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-purple-700 hover:underline whitespace-nowrap"
          >
            <Code2 className="h-3.5 w-3.5" />
            {t('freeMeetingsPromo', 'apiLink', 'Build with our API')}
          </a>
        </div>
      </CardContent>
    </Card>
  );
};

export default FreeMeetingsPromoCard;
