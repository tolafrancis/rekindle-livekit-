import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  MessageSquare, Search, Loader2, CheckCircle, Clock, AlertTriangle,
  RefreshCw, Building2, User, Calendar, Send, XCircle
} from 'lucide-react';

interface SupportTicket {
  id: string;
  ministry_id: string;
  user_id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string;
  resolved_at: string;
  resolved_by: string;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
}

interface Ministry {
  id: string;
  name: string;
  theme_color: string;
}

interface SupportTicketsManagerProps {
  onUpdate: () => void;
}

export const SupportTicketsManager: React.FC<SupportTicketsManagerProps> = ({ onUpdate }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ministries, setMinistries] = useState<Record<string, Ministry>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ticketsRes, ministriesRes] = await Promise.all([
        supabase.from('ministry_support_tickets').select('*').order('created_at', { ascending: false }),
        supabase.from('ministry_groups').select('id, name, theme_color')
      ]);

      setTickets(ticketsRes.data || []);

      const ministryMap: Record<string, Ministry> = {};
      (ministriesRes.data || []).forEach(m => { ministryMap[m.id] = m; });
      setMinistries(ministryMap);
    } catch (err) {
      console.error('Error loading tickets:', err);
      toast({ title: t('supportTicketsManager', 'errorTitle', 'Error'), description: t('supportTicketsManager', 'failedToLoad', 'Failed to load support tickets'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setResolutionNotes(ticket.resolution_notes || '');
    setShowTicketModal(true);
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
      
      if (newStatus === 'resolved') {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user?.id;
        updates.resolution_notes = resolutionNotes;
      } else if (newStatus === 'in_progress') {
        updates.assigned_to = user?.id;
      }

      await supabase
        .from('ministry_support_tickets')
        .update(updates)
        .eq('id', ticketId);

      toast({ title: t('supportTicketsManager', 'successTitle', 'Success'), description: newStatus === 'resolved' ? t('supportTicketsManager', 'ticketResolved', 'Ticket resolved') : t('supportTicketsManager', 'ticketUpdated', 'Ticket updated') });
      setShowTicketModal(false);
      loadData();
      onUpdate();
    } catch (err: any) {
      toast({ title: t('supportTicketsManager', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;
    setSaving(true);
    await handleUpdateStatus(selectedTicket.id, 'resolved');
    setSaving(false);
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-500 text-white">{t('supportTicketsManager', 'urgent', 'Urgent')}</Badge>;
      case 'high':
        return <Badge className="bg-orange-500 text-white">{t('supportTicketsManager', 'high', 'High')}</Badge>;
      case 'normal':
        return <Badge className="bg-blue-100 text-blue-700">{t('supportTicketsManager', 'normal', 'Normal')}</Badge>;
      case 'low':
        return <Badge variant="secondary">{t('supportTicketsManager', 'low', 'Low')}</Badge>;
      default:
        return <Badge variant="secondary">{priority}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-amber-100 text-amber-700">{t('supportTicketsManager', 'open', 'Open')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700">{t('supportTicketsManager', 'inProgress', 'In Progress')}</Badge>;
      case 'resolved':
        return <Badge className="bg-green-100 text-green-700">{t('supportTicketsManager', 'resolved', 'Resolved')}</Badge>;
      case 'closed':
        return <Badge variant="secondary">{t('supportTicketsManager', 'closed', 'Closed')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const ministry = ministries[ticket.ministry_id];
    const matchesSearch = ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ministry?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const stats = {
    open: tickets.filter(item => item.status === 'open').length,
    inProgress: tickets.filter(item => item.status === 'in_progress').length,
    resolved: tickets.filter(item => item.status === 'resolved').length,
    urgent: tickets.filter(item => item.priority === 'urgent' && item.status !== 'resolved').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm text-amber-600">{t('supportTicketsManager', 'open', 'Open')}</p>
                <p className="text-2xl font-bold text-amber-700">{stats.open}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-blue-600">{t('supportTicketsManager', 'inProgress', 'In Progress')}</p>
                <p className="text-2xl font-bold text-blue-700">{stats.inProgress}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-green-600">{t('supportTicketsManager', 'resolved', 'Resolved')}</p>
                <p className="text-2xl font-bold text-green-700">{stats.resolved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-red-600">{t('supportTicketsManager', 'urgent', 'Urgent')}</p>
                <p className="text-2xl font-bold text-red-700">{stats.urgent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('supportTicketsManager', 'searchPlaceholder', 'Search tickets...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('supportTicketsManager', 'statusPlaceholder', 'Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('supportTicketsManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="open">{t('supportTicketsManager', 'open', 'Open')}</SelectItem>
                <SelectItem value="in_progress">{t('supportTicketsManager', 'inProgress', 'In Progress')}</SelectItem>
                <SelectItem value="resolved">{t('supportTicketsManager', 'resolved', 'Resolved')}</SelectItem>
                <SelectItem value="closed">{t('supportTicketsManager', 'closed', 'Closed')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('supportTicketsManager', 'priorityPlaceholder', 'Priority')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('supportTicketsManager', 'allPriority', 'All Priority')}</SelectItem>
                <SelectItem value="urgent">{t('supportTicketsManager', 'urgent', 'Urgent')}</SelectItem>
                <SelectItem value="high">{t('supportTicketsManager', 'high', 'High')}</SelectItem>
                <SelectItem value="normal">{t('supportTicketsManager', 'normal', 'Normal')}</SelectItem>
                <SelectItem value="low">{t('supportTicketsManager', 'low', 'Low')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('supportTicketsManager', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('supportTicketsManager', 'supportTickets', 'Support Tickets')} ({filteredTickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">{t('supportTicketsManager', 'noTickets', 'No support tickets found')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTickets.map(ticket => {
                const ministry = ministries[ticket.ministry_id];
                return (
                  <div 
                    key={ticket.id} 
                    className="p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleViewTicket(ticket)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{ticket.subject}</h3>
                          {getPriorityBadge(ticket.priority)}
                          {getStatusBadge(ticket.status)}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{ticket.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {ministry?.name || t('supportTicketsManager', 'unknownMinistry', 'Unknown Ministry')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </span>
                          <Badge variant="outline" className="text-xs">{ticket.category}</Badge>
                        </div>
                      </div>
                      {ticket.status === 'open' && (
                        <Button 
                          size="sm" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStatus(ticket.id, 'in_progress');
                          }}
                        >
                          {t('supportTicketsManager', 'take', 'Take')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Modal */}
      <Dialog open={showTicketModal} onOpenChange={setShowTicketModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('supportTicketsManager', 'ticketDetails', 'Ticket Details')}</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getPriorityBadge(selectedTicket.priority)}
                {getStatusBadge(selectedTicket.status)}
                <Badge variant="outline">{selectedTicket.category}</Badge>
              </div>

              <div>
                <Label className="text-gray-500">{t('supportTicketsManager', 'subject', 'Subject')}</Label>
                <p className="font-semibold">{selectedTicket.subject}</p>
              </div>

              <div>
                <Label className="text-gray-500">{t('supportTicketsManager', 'description', 'Description')}</Label>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedTicket.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">{t('supportTicketsManager', 'ministry', 'Ministry')}</Label>
                  <p className="font-medium">{ministries[selectedTicket.ministry_id]?.name || t('supportTicketsManager', 'unknown', 'Unknown')}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('supportTicketsManager', 'created', 'Created')}</Label>
                  <p className="font-medium">{new Date(selectedTicket.created_at).toLocaleString()}</p>
                </div>
              </div>

              {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                <div>
                  <Label>{t('supportTicketsManager', 'resolutionNotes', 'Resolution Notes')}</Label>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder={t('supportTicketsManager', 'resolutionPlaceholder', 'Add notes about how this was resolved...')}
                    rows={3}
                  />
                </div>
              )}

              {selectedTicket.resolution_notes && selectedTicket.status === 'resolved' && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <Label className="text-green-700">{t('supportTicketsManager', 'resolutionNotes', 'Resolution Notes')}</Label>
                  <p className="text-green-800">{selectedTicket.resolution_notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTicketModal(false)}>{t('supportTicketsManager', 'close', 'Close')}</Button>
            {selectedTicket && selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
              <>
                {selectedTicket.status === 'open' && (
                  <Button 
                    variant="outline"
                    onClick={() => handleUpdateStatus(selectedTicket.id, 'in_progress')}
                  >
                    {t('supportTicketsManager', 'takeTicket', 'Take Ticket')}
                  </Button>
                )}
                <Button onClick={handleResolveTicket} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {t('supportTicketsManager', 'resolve', 'Resolve')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupportTicketsManager;
