import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Card, CardContent } from '@rekindle/ui/card';
import { Loader2, Radio } from 'lucide-react';

interface SessionOption {
  id: string;
  target_language: string;
  status: string;
}

/**
 * /display?service_id=:id — public landing page for Tier 2 multi-language
 * services: one QR/URL the ministry projects or prints, each visitor taps
 * their own language and lands on /display/:sessionId.
 */
export const TranslationDisplayLanding: React.FC = () => {
  const [params] = useSearchParams();
  const serviceId = params.get('service_id');
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<SessionOption[]>([]);

  useEffect(() => {
    if (!serviceId) { setLoading(false); return; }
    supabase
      .from('translation_sessions')
      .select('id, target_language, status')
      .eq('service_id', serviceId)
      .neq('status', 'ended')
      .then(({ data }) => {
        setOptions((data as SessionOption[]) || []);
        setLoading(false);
      });
  }, [serviceId]);

  if (!serviceId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white/70 px-4 text-center">
        <p>This link is missing a service ID. Ask your ministry for the correct QR code or link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center px-4 py-10">
      <Radio className="h-8 w-8 text-indigo-400 mb-2" />
      <h1 className="text-lg font-semibold mb-1">Choose Your Language</h1>
      <p className="text-sm text-white/50 mb-6">Tap the language you'd like to follow along in.</p>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      ) : options.length === 0 ? (
        <p className="text-sm text-white/50">No active translation sessions for this service right now.</p>
      ) : (
        <div className="w-full max-w-sm space-y-2">
          {options.map(opt => (
            <Link key={opt.id} to={`/display/${opt.id}`}>
              {/* Explicit bg/text here, not Card's own defaults (bg-background /
                  inherited color) — real bug found live: Card's bg-background
                  resolves to this app's light theme (near-white), while this
                  page's dark wrapper sets text-white on an ancestor with nothing
                  overriding it inside the card, so the label rendered as
                  white-on-white — invisible, looked like a blank button. */}
              <Card className="bg-white/5 border-white/10 hover:border-indigo-400 hover:bg-white/10 transition-colors">
                <CardContent className="py-4 text-center font-medium text-white">
                  {opt.target_language.toUpperCase()}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default TranslationDisplayLanding;
