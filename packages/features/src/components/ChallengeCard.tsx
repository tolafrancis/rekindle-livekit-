import React, { useState } from 'react'
import { Card } from '@rekindle/ui/card'
import { Button } from '@rekindle/ui/button'
import { Progress } from '@rekindle/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@rekindle/ui/dialog'
import { Label } from '@rekindle/ui/label'
import { Switch } from '@rekindle/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select'
import {
  PrayerChallenge,
  ChallengeParticipant
} from '@rekindle/types/prayerTypes'
import {
  Users,
  Clock,
  Play,
  Share2,
  Calendar,
  Flame,
  CheckCircle,
  BookOpen,
  Bell,
  Settings
} from 'lucide-react'

const SESSION_DURATIONS: Record<string, { label: string; duration: number }> = {
  quick: { label: '5 min Prayer', duration: 5 },
  standard: { label: '15 min Prayer', duration: 15 },
  deep: { label: '30 min Prayer', duration: 30 }
}
const peacefulBackgrounds = [
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006543774_0da9902b.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006544204_90a23c85.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006539724_bc8b8863.jpg',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006548901_cd90d7e5.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006569417_9acb0a21.jpg',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006574829_e2a0af96.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006571635_45f2e485.jpg',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006576313_4bd35f98.png'
]

interface Props {
  challenge: PrayerChallenge
  participation?: ChallengeParticipant
  onJoin: () => void
  onStart: () => void
  onShare: () => void
  onUpdateReminder?: (settings: {
    enabled: boolean;
    frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    days?: number[];
  }) => void;
  participantCount: number
}

const categoryColors: Record<string, string> = {
  Healing: 'from-green-500/70 to-emerald-600/70',
  Thanksgiving: 'from-amber-500/70 to-orange-600/70',
  Intercession: 'from-blue-500/70 to-cyan-600/70',
  Revival: 'from-red-500/70 to-rose-600/70',
  Family: 'from-pink-500/70 to-rose-500/70',
  Career: 'from-indigo-500/70 to-purple-600/70',
  'Spiritual Growth': 'from-purple-500/70 to-violet-600/70',
  Missions: 'from-teal-500/70 to-cyan-600/70'
}

export const ChallengeCard: React.FC<Props> = ({
  challenge,
  participation,
  onJoin,
  onStart,
  onShare,
  onUpdateReminder,
  participantCount
}) => {
  const challengeId = String(challenge.id)
  const [showReminderDialog, setShowReminderDialog] = useState(false)
  const [reminderSettings, setReminderSettings] = useState({
    enabled: participation?.reminder_enabled ?? false,
    frequency: (participation?.reminder_frequency || 'daily') as 'hourly' | 'daily' | 'weekly' | 'monthly',
    time: participation?.reminder_time || '09:00',
    days: participation?.reminder_days || [1, 3, 5] // Default: Mon, Wed, Fri
  })

  const hasJoined = !!participation
  const progress = participation
    ? Math.min((participation.completed_sessions / 21) * 100, 100)
    : 0

  const gradient =
    categoryColors[challenge.category] ||
    'from-gray-500/70 to-gray-600/70'

  const sessionInfo =
    SESSION_DURATIONS[challenge.session_type] ?? {
      label: 'Prayer Session',
      duration: 0
    }

  const bgIndex = challengeId.charCodeAt(0) % peacefulBackgrounds.length
  const backgroundImage = peacefulBackgrounds[bgIndex]

  const handleSaveReminder = () => {
    if (onUpdateReminder) {
      onUpdateReminder(reminderSettings)
    }
    setShowReminderDialog(false)
  }

  const getDayName = (day: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days[day]
  }

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-all">
      {/* Header */}
      <div
        className="h-36 relative bg-cover bg-center"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      >
        <div className={`absolute inset-0 bg-gradient-to-r ${gradient}`} />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white p-4">
            <BookOpen className="h-8 w-8 mx-auto mb-2 drop-shadow-lg" />
            <h3 className="font-bold text-lg drop-shadow-lg line-clamp-2">
              {challenge.title}
            </h3>
          </div>
        </div>

        <div className="absolute top-2 right-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onShare}
            className="text-white hover:bg-white/20"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="absolute top-2 left-2">
          <span className="text-xs px-2 py-1 rounded-full bg-white/90 text-purple-700 font-medium">
            {challenge.category}
          </span>
        </div>
      </div>

      <div className="p-4">
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {challenge.description}
        </p>

        {/* Prayer points */}
        {challenge.prayer_points?.length > 0 && (
          <div className="bg-purple-50 rounded-lg p-3 mb-3">
            <p className="text-xs font-medium text-purple-700 mb-2">
              Prayer Points:
            </p>

            <div className="space-y-2">
              {challenge.prayer_points.slice(0, 2).map((p, i) => (
                <div
                  key={`prayer-${challengeId}-${i}`}
                  className="text-xs"
                >
                  <p className="font-medium text-purple-800">{p.title}</p>

                  {p.scripture && (
                    <p className="text-purple-600 italic mt-0.5">
                      {p.scripture}
                      {p.scriptureText &&
                        `: "${p.scriptureText.substring(0, 60)}..."`}
                    </p>
                  )}
                </div>
              ))}

              {challenge.prayer_points.length > 2 && (
                <p className="text-xs text-purple-500">
                  +{challenge.prayer_points.length - 2} more points
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {sessionInfo.label}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {participantCount} joined
          </span>
        </div>

        {challenge.live_session_date && (
          <div className="bg-orange-50 rounded-lg p-2 mb-3 flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-orange-600" />
            <span className="text-orange-700">
              Live:{' '}
              {new Date(challenge.live_session_date).toLocaleDateString()} at{' '}
              {new Date(challenge.live_session_date).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        )}

        {hasJoined && participation ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Flame className="h-4 w-4 text-orange-500" />
                {participation.current_streak} day streak
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                {participation.completed_sessions} sessions
              </span>
            </div>

            <Progress value={progress} className="h-2" />

            <div className="flex gap-2">
              <Button
                onClick={onStart}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Prayer Session
              </Button>
              <Button
                onClick={() => setShowReminderDialog(true)}
                variant="outline"
                size="icon"
                className="relative"
              >
                <Bell className={`h-4 w-4 ${reminderSettings.enabled ? 'text-purple-600' : 'text-gray-400'}`} />
                {reminderSettings.enabled && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-purple-600 rounded-full" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={onJoin} variant="outline" className="w-full">
            <Users className="h-4 w-4 mr-2" />
            Join Challenge
          </Button>
        )}

        <p className="text-xs text-gray-400 mt-2 text-center">
          Created by {challenge.creator_name || 'Anonymous'}
        </p>
      </div>
    </Card>

    {/* Reminder Configuration Dialog */}
    <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-purple-600" />
            Prayer Reminders
          </DialogTitle>
          <DialogDescription>
            Set up optional reminders for this prayer challenge
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="reminder-enabled" className="flex flex-col gap-1">
              <span className="font-medium">Enable Reminders</span>
              <span className="text-xs text-gray-500">
                Receive gentle notifications for prayer
              </span>
            </Label>
            <Switch
              id="reminder-enabled"
              checked={reminderSettings.enabled}
              onCheckedChange={(checked) =>
                setReminderSettings({ ...reminderSettings, enabled: checked })
              }
            />
          </div>

          {reminderSettings.enabled && (
            <>
              {/* Frequency Selection */}
              <div className="space-y-2">
                <Label>Reminder Frequency</Label>
                <Select
                  value={reminderSettings.frequency}
                  onValueChange={(value: 'hourly' | 'daily' | 'weekly' | 'monthly') =>
                    setReminderSettings({ ...reminderSettings, frequency: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {reminderSettings.frequency === 'hourly' && 'Reminders every hour during the day'}
                  {reminderSettings.frequency === 'daily' && 'One reminder each day'}
                  {reminderSettings.frequency === 'weekly' && 'Reminders on selected days of the week'}
                  {reminderSettings.frequency === 'monthly' && 'Reminders on selected days of the month'}
                </p>
              </div>

              {/* Time Selection (for non-hourly) */}
              {reminderSettings.frequency !== 'hourly' && (
                <div className="space-y-2">
                  <Label>Preferred Time</Label>
                  <input
                    type="time"
                    value={reminderSettings.time}
                    onChange={(e) =>
                      setReminderSettings({ ...reminderSettings, time: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <p className="text-xs text-gray-500">
                    Choose when you'd like to receive your reminder
                  </p>
                </div>
              )}

              {/* Weekly Day Selection */}
              {reminderSettings.frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Select Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const days = reminderSettings.days || []
                          const newDays = days.includes(day)
                            ? days.filter(d => d !== day)
                            : [...days, day]
                          setReminderSettings({ ...reminderSettings, days: newDays })
                        }}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          (reminderSettings.days || []).includes(day)
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {getDayName(day)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Select which days you'd like to be reminded
                  </p>
                </div>
              )}

              {/* Monthly Day Selection */}
              {reminderSettings.frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Select
                    value={(reminderSettings.days?.[0] || 1).toString()}
                    onValueChange={(value) =>
                      setReminderSettings({ ...reminderSettings, days: [parseInt(value)] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of the month
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Reminders are stored for future notification delivery. 
                  Make sure push notifications are enabled in your device settings.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowReminderDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveReminder} className="bg-purple-600 hover:bg-purple-700">
            Save Reminder Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  )
}