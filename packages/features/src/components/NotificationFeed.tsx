import { useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import type { AppNotification } from '../useNotifications';

// Shared notification dropdown panel — ported from the consumer app
// (apps/rekindle/src/components/NotificationFeed.tsx) so the ministry app's
// header can render the same feed against the same `notifications` table.

const TYPE_META: Record<string, { color: string; dot: string; label: string }> = {
  new_revelation:        { color: 'text-purple-600',  dot: 'bg-purple-500',  label: 'Revelation'      },
  new_question:          { color: 'text-blue-600',    dot: 'bg-blue-500',    label: 'Question'        },
  announcement:          { color: 'text-amber-600',   dot: 'bg-amber-500',   label: 'Announcement'    },
  event_reminder_1hr:    { color: 'text-rose-600',    dot: 'bg-rose-500',    label: 'Event Soon'      },
  event_reminder_24hr:   { color: 'text-orange-600',  dot: 'bg-orange-500',  label: 'Event Tomorrow'  },
  live_session_starting: { color: 'text-red-600',     dot: 'bg-red-500',     label: 'Going Live'      },
  prayer_request:        { color: 'text-indigo-600',  dot: 'bg-indigo-500',  label: 'Prayer Request'  },
  devotional_reminder:   { color: 'text-green-600',   dot: 'bg-green-500',   label: 'Devotional'      },
  answer_posted:         { color: 'text-teal-600',    dot: 'bg-teal-500',    label: 'Answer'          },
  answer_accepted:       { color: 'text-emerald-600', dot: 'bg-emerald-500', label: 'Accepted'        },
  reading_reminder:      { color: 'text-amber-600',   dot: 'bg-amber-500',   label: 'Bible Reading'   },
  book_reminder:         { color: 'text-blue-600',    dot: 'bg-blue-500',    label: 'Book'            },
  prayer_reminder:       { color: 'text-purple-600',  dot: 'bg-purple-500',  label: 'Prayer'          },
  memory_reminder:       { color: 'text-rose-600',    dot: 'bg-rose-500',    label: 'Scripture Memory'},
  leader_broadcast:      { color: 'text-purple-700',  dot: 'bg-purple-700',  label: 'Broadcast'       },
  ministry_broadcast:    { color: 'text-purple-700',  dot: 'bg-purple-700',  label: 'Broadcast'       },
  broadcast:             { color: 'text-gray-600',    dot: 'bg-gray-500',    label: 'Broadcast'       },
  event_reminder:        { color: 'text-orange-600',  dot: 'bg-orange-500',  label: 'Event'           },
};

const getMeta = (type: string) =>
  TYPE_META[type] ?? { color: 'text-gray-600', dot: 'bg-gray-400', label: 'Notification' };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  /** Distance from the top of the viewport to anchor the panel below —
   * defaults to the consumer app's 64px header; pass the actual header
   * height when it differs (e.g. the ministry app's 56px header). */
  topOffsetClassName?: string;
}

export function NotificationFeed({
  open,
  onClose,
  notifications,
  unreadCount,
  loading,
  markRead,
  markAllRead,
  dismiss,
  topOffsetClassName = 'top-16',
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    if (n.link) window.location.href = n.link;
    onClose();
  };

  return (
    <div
      ref={panelRef}
      // Fixed (not absolute) so the panel escapes the header toolbar's
      // overflow-x-auto clipping; z above the sticky header (z-50).
      className={`fixed ${topOffsetClassName} right-2 md:right-4 w-[min(92vw,24rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 z-[70] overflow-hidden`}
      style={{ maxHeight: '80vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-purple-600" />
          <span className="font-semibold text-gray-800 text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium px-2 py-1 rounded-md hover:bg-purple-50 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 56px)' }}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Bell className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-gray-400 text-sm font-medium">You're all caught up!</p>
            <p className="text-gray-300 text-xs mt-1">New notifications will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.map(n => {
              const meta = getMeta(n.type);
              return (
                <div
                  key={n.id}
                  className={`group relative flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${!n.is_read ? 'bg-purple-50/40' : ''}`}
                  onClick={() => handleClick(n)}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full ${!n.is_read ? meta.dot : 'bg-transparent'}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 break-words leading-snug">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 break-words line-clamp-2">{n.message}</p>
                    {n.sender_name && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">— {n.sender_name}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {n.link && <ExternalLink className="h-3.5 w-3.5 text-gray-400" />}
                    <button
                      onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
