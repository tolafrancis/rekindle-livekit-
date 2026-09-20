import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Card, CardContent } from '@rekindle/ui/card';
import { Loader2, Users, UserCheck, UserX, Clock, MessageSquare, HelpCircle, BarChart3, Film } from 'lucide-react';
import {
  getAttendanceSummary, getRegistrantDetail, getEngagementSummary, getReplaySummary,
  type WebinarAttendanceSummary, type WebinarRegistrantDetail, type WebinarEngagementSummary, type WebinarReplaySummary,
} from './webinarAnalyticsService';
import type { MinistryWebinar } from './webinarControl';

interface WebinarAnalyticsProps {
  webinar: MinistryWebinar;
  open: boolean;
  onClose: () => void;
}

function StatTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className="h-5 w-5 text-purple-600 shrink-0" />
        <div>
          <p className="text-lg font-semibold leading-none">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Host-only per-webinar analytics: attendance funnel, engagement tiles,
 *  replay tile. Reached from WebinarEndScreen.tsx and WebinarDashboard.tsx. */
export function WebinarAnalytics({ webinar, open, onClose }: WebinarAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<WebinarAttendanceSummary | null>(null);
  const [registrants, setRegistrants] = useState<WebinarRegistrantDetail[]>([]);
  const [engagement, setEngagement] = useState<WebinarEngagementSummary | null>(null);
  const replay: WebinarReplaySummary = getReplaySummary(webinar);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      getAttendanceSummary(webinar.id),
      getRegistrantDetail(webinar.id),
      getEngagementSummary(webinar.id),
    ]).then(([a, r, e]) => {
      setAttendance(a);
      setRegistrants(r);
      setEngagement(e);
      setLoading(false);
    });
  }, [open, webinar.id]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{webinar.title} — Analytics</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /></div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium mb-2">Attendance</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile icon={Users} label="Registered" value={attendance?.registeredCount ?? 0} />
                <StatTile icon={UserCheck} label="Attended" value={attendance?.attendedCount ?? 0} />
                <StatTile icon={UserX} label="No-show" value={attendance?.noShowCount ?? 0} />
                <StatTile
                  icon={Clock} label="Avg. duration"
                  value={attendance?.avgDurationMinutes != null ? `${Math.round(attendance.avgDurationMinutes)}m` : '—'}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Guest registrants aren't matched to attendance (no stable identity to join on).</p>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Engagement</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatTile icon={HelpCircle} label="Questions asked" value={engagement?.questionsAsked ?? 0} />
                <StatTile icon={HelpCircle} label="Questions answered" value={engagement?.questionsAnswered ?? 0} />
                <StatTile icon={BarChart3} label="Polls run" value={engagement?.pollsRun ?? 0} />
                <StatTile icon={BarChart3} label="Poll votes" value={engagement?.pollVotesCast ?? 0} />
                <StatTile icon={MessageSquare} label="Chat messages" value={engagement?.chatMessages ?? 0} />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Replay</p>
              {replay.recordingUrl ? (
                <a href={replay.recordingUrl} target="_blank" rel="noreferrer" className="text-sm text-purple-600 hover:underline flex items-center gap-1.5">
                  <Film className="h-4 w-4" /> Watch recording
                  {replay.recordingDurationSeconds ? ` (${Math.round(replay.recordingDurationSeconds / 60)}m)` : ''}
                </a>
              ) : (
                <p className="text-sm text-gray-400">{replay.recordingStatus === 'processing' ? 'Recording is processing…' : 'No recording available.'}</p>
              )}
            </div>

            {registrants.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Registrants</p>
                <div className="max-h-56 overflow-y-auto -mx-1 px-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b">
                        <th className="py-1.5 font-medium">Registrant</th>
                        <th className="py-1.5 font-medium text-right">Status</th>
                        <th className="py-1.5 font-medium text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrants.map((r, i) => (
                        <tr key={r.userId ?? `${r.guestEmail}-${i}`} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{r.guestName || r.guestEmail || (r.userId ? 'Member' : 'Guest')}</td>
                          <td className="py-1.5 text-right">
                            {r.userId ? (r.attended ? 'Attended' : 'No-show') : 'Unknown (guest)'}
                          </td>
                          <td className="py-1.5 text-right text-gray-500">
                            {r.durationMinutes != null ? `${Math.round(r.durationMinutes)}m` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default WebinarAnalytics;
