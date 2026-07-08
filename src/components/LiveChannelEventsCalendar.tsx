import React, { useState, useMemo } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Radio,
  Video,
  Mic,
  Clock
} from 'lucide-react';
import { ChannelEvent } from '@/types/liveChannelTypes';

interface LiveChannelEventsCalendarProps {
  events: ChannelEvent[];
  onEventClick?: (event: ChannelEvent) => void;
  onDateSelect?: (date: Date) => void;
}

export const LiveChannelEventsCalendar: React.FC<LiveChannelEventsCalendarProps> = ({
  events,
  onEventClick,
  onDateSelect
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Get days in month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, firstDay, lastDay };
  };

  // Get events for a specific date
  const getEventsForDate = (date: Date): ChannelEvent[] => {
    return events.filter(event => {
      const eventDate = new Date(event.scheduled_start);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  };

  // Get events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return getEventsForDate(selectedDate);
  }, [selectedDate, events]);

  // Navigate months
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    onDateSelect?.(today);
  };

  // Handle date click
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  // Format time
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Check if date is selected
  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Generate calendar days
  const calendarDays: (Date | null)[] = [];
  
  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-purple-600" />
              {monthName}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {/* Week day headers */}
            {weekDays.map(day => (
              <div key={day} className="text-center font-semibold text-sm text-gray-600 py-2">
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const dayEvents = getEventsForDate(date);
              const hasEvents = dayEvents.length > 0;
              const hasLiveEvent = dayEvents.some(e => e.status === 'live');
              const isPast = date < new Date() && !isToday(date);

              return (
                <button
                  key={index}
                  onClick={() => handleDateClick(date)}
                  className={`
                    aspect-square p-2 rounded-lg border-2 transition-all
                    ${isSelected(date) 
                      ? 'border-purple-600 bg-purple-50' 
                      : 'border-gray-200 hover:border-purple-300'
                    }
                    ${isToday(date) && !isSelected(date) 
                      ? 'border-purple-400 bg-purple-50' 
                      : ''
                    }
                    ${isPast ? 'opacity-50' : ''}
                    ${hasEvents ? 'font-semibold' : ''}
                  `}
                >
                  <div className="flex flex-col h-full">
                    <span className={`text-sm ${isToday(date) ? 'text-purple-600' : ''}`}>
                      {date.getDate()}
                    </span>
                    {hasEvents && (
                      <div className="flex flex-col gap-1 mt-1">
                        {hasLiveEvent && (
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mx-auto" />
                        )}
                        <div className="flex gap-0.5 justify-center">
                          {dayEvents.slice(0, 3).map((_, i) => (
                            <div 
                              key={i} 
                              className="w-1.5 h-1.5 bg-purple-600 rounded-full"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {selectedDate ? (
              <>
                {selectedDate.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  year: selectedDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                })}
                {isToday(selectedDate) && (
                  <Badge variant="secondary" className="ml-2">Today</Badge>
                )}
              </>
            ) : (
              'Select a Date'
            )}
          </CardTitle>
        </CardHeader>

        <CardContent>
          {!selectedDate ? (
            <div className="text-center py-8 text-gray-500">
              <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select a date to view events</p>
            </div>
          ) : selectedDateEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No events scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className="w-full text-left p-3 rounded-lg border-2 border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    {/* Time */}
                    <div className="flex-shrink-0 text-center">
                      <div className="text-xs text-gray-500">
                        <Clock className="h-3 w-3 mx-auto mb-1" />
                        {formatTime(event.scheduled_start)}
                      </div>
                    </div>

                    {/* Event Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {event.status === 'live' && (
                          <Badge className="bg-red-500 text-white text-xs">
                            <Radio className="h-2 w-2 mr-1 animate-pulse" />
                            LIVE
                          </Badge>
                        )}
                        {event.is_video_enabled ? (
                          <Video className="h-3 w-3 text-purple-600" />
                        ) : (
                          <Mic className="h-3 w-3 text-purple-600" />
                        )}
                      </div>
                      <h4 className="font-semibold text-sm truncate mb-1">
                        {event.title}
                      </h4>
                      {event.channel && (
                        <p className="text-xs text-gray-500 truncate">
                          {event.channel.name}
                        </p>
                      )}
                      {event.total_registered > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {event.total_registered} registered
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveChannelEventsCalendar;