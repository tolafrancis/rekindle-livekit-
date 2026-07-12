import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  FileText, Search, Loader2, RefreshCw, Building2, User,
  Calendar, Eye, Download, Shield, AlertTriangle, CheckCircle,
  XCircle, Edit, Trash2, UserPlus, Settings
} from 'lucide-react';

interface AuditLog {
  id: string;
  ministry_id: string;
  actor_id: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  old_values: any;
  new_values: any;
  metadata: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface Ministry {
  id: string;
  name: string;
}

export const AuditLogsViewer: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [ministries, setMinistries] = useState<Record<string, Ministry>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('7');
  
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadData();
  }, [dateFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateFilter));

      const [logsRes, ministriesRes] = await Promise.all([
        supabase
          .from('ministry_audit_logs')
          .select('*')
          .gte('created_at', daysAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('ministry_groups').select('id, name')
      ]);

      setLogs(logsRes.data || []);

      const ministryMap: Record<string, Ministry> = {};
      (ministriesRes.data || []).forEach(m => { ministryMap[m.id] = m; });
      setMinistries(ministryMap);
    } catch (err) {
      console.error('Error loading audit logs:', err);
      toast({ title: t('auditLogsViewer', 'error', 'Error'), description: t('auditLogsViewer', 'failedToLoad', 'Failed to load audit logs'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetailsModal(true);
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Ministry', 'Actor Type', 'Action', 'Resource Type', 'Resource ID'];
    const rows = filteredLogs.map(log => [
      new Date(log.created_at).toLocaleString(),
      ministries[log.ministry_id]?.name || 'Unknown',
      log.actor_type,
      log.action,
      log.resource_type,
      log.resource_id
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getActionIcon = (action: string) => {
    if (action.includes('approved') || action.includes('activated') || action.includes('verified')) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (action.includes('rejected') || action.includes('suspended') || action.includes('deleted')) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (action.includes('updated') || action.includes('changed')) {
      return <Edit className="h-4 w-4 text-blue-500" />;
    }
    if (action.includes('created') || action.includes('added')) {
      return <UserPlus className="h-4 w-4 text-green-500" />;
    }
    return <Settings className="h-4 w-4 text-gray-500" />;
  };

  const getActionBadge = (action: string) => {
    if (action.includes('approved') || action.includes('activated') || action.includes('verified')) {
      return <Badge className="bg-green-100 text-green-700">{action}</Badge>;
    }
    if (action.includes('rejected') || action.includes('suspended') || action.includes('deleted')) {
      return <Badge className="bg-red-100 text-red-700">{action}</Badge>;
    }
    if (action.includes('updated') || action.includes('changed')) {
      return <Badge className="bg-blue-100 text-blue-700">{action}</Badge>;
    }
    return <Badge variant="secondary">{action}</Badge>;
  };

  const getActorBadge = (actorType: string) => {
    switch (actorType) {
      case 'platform_admin':
        return <Badge className="bg-purple-100 text-purple-700"><Shield className="h-3 w-3 mr-1" />{t('auditLogsViewer', 'platformAdmin', 'Platform Admin')}</Badge>;
      case 'ministry_admin':
        return <Badge className="bg-blue-100 text-blue-700"><Building2 className="h-3 w-3 mr-1" />{t('auditLogsViewer', 'ministryAdmin', 'Ministry Admin')}</Badge>;
      case 'user':
        return <Badge variant="secondary"><User className="h-3 w-3 mr-1" />{t('auditLogsViewer', 'user', 'User')}</Badge>;
      case 'system':
        return <Badge variant="outline"><Settings className="h-3 w-3 mr-1" />{t('auditLogsViewer', 'system', 'System')}</Badge>;
      default:
        return <Badge variant="secondary">{actorType}</Badge>;
    }
  };

  const filteredLogs = logs.filter(log => {
    const ministry = ministries[log.ministry_id];
    const matchesSearch = log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ministry?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resource_type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action?.includes(actionFilter);
    const matchesActor = actorFilter === 'all' || log.actor_type === actorFilter;
    return matchesSearch && matchesAction && matchesActor;
  });

  // Get unique actions for filter
  const uniqueActions = [...new Set(logs.map(l => l.action?.split('_')[0]).filter(Boolean))];

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
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-8 w-8 mx-auto text-purple-500 mb-2" />
            <p className="text-2xl font-bold">{logs.length}</p>
            <p className="text-sm text-gray-500">{t('auditLogsViewer', 'totalLogs', 'Total Logs')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield className="h-8 w-8 mx-auto text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{logs.filter(l => l.actor_type === 'platform_admin').length}</p>
            <p className="text-sm text-gray-500">{t('auditLogsViewer', 'adminActions', 'Admin Actions')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
            <p className="text-2xl font-bold">{logs.filter(l => l.action?.includes('suspended') || l.action?.includes('rejected')).length}</p>
            <p className="text-sm text-gray-500">{t('auditLogsViewer', 'enforcementActions', 'Enforcement Actions')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold">{logs.filter(l => l.action?.includes('approved') || l.action?.includes('verified')).length}</p>
            <p className="text-sm text-gray-500">{t('auditLogsViewer', 'approvals', 'Approvals')}</p>
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
                placeholder={t('auditLogsViewer', 'searchLogs', 'Search logs...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actorFilter} onValueChange={setActorFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('auditLogsViewer', 'actor', 'Actor')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('auditLogsViewer', 'allActors', 'All Actors')}</SelectItem>
                <SelectItem value="platform_admin">{t('auditLogsViewer', 'platformAdmin', 'Platform Admin')}</SelectItem>
                <SelectItem value="ministry_admin">{t('auditLogsViewer', 'ministryAdmin', 'Ministry Admin')}</SelectItem>
                <SelectItem value="user">{t('auditLogsViewer', 'user', 'User')}</SelectItem>
                <SelectItem value="system">{t('auditLogsViewer', 'system', 'System')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-36">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('auditLogsViewer', 'last24Hours', 'Last 24 hours')}</SelectItem>
                <SelectItem value="7">{t('auditLogsViewer', 'last7Days', 'Last 7 days')}</SelectItem>
                <SelectItem value="30">{t('auditLogsViewer', 'last30Days', 'Last 30 days')}</SelectItem>
                <SelectItem value="90">{t('auditLogsViewer', 'last90Days', 'Last 90 days')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              {t('auditLogsViewer', 'export', 'Export')}
            </Button>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('auditLogsViewer', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('auditLogsViewer', 'auditLogs', 'Audit Logs')} ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('auditLogsViewer', 'timestamp', 'Timestamp')}</th>
                  <th className="text-left p-4 font-medium">{t('auditLogsViewer', 'ministry', 'Ministry')}</th>
                  <th className="text-left p-4 font-medium">{t('auditLogsViewer', 'actor', 'Actor')}</th>
                  <th className="text-left p-4 font-medium">{t('auditLogsViewer', 'action', 'Action')}</th>
                  <th className="text-left p-4 font-medium">{t('auditLogsViewer', 'resource', 'Resource')}</th>
                  <th className="text-left p-4 font-medium">{t('auditLogsViewer', 'details', 'Details')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.slice(0, 100).map(log => {
                  const ministry = ministries[log.ministry_id];
                  return (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="p-4 text-sm text-gray-600">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <span className="font-medium">{ministry?.name || t('auditLogsViewer', 'platform', 'Platform')}</span>
                      </td>
                      <td className="p-4">
                        {getActorBadge(log.actor_type)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.action)}
                          {getActionBadge(log.action)}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">{log.resource_type}</Badge>
                      </td>
                      <td className="p-4">
                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(log)}>
                          <Eye className="h-4 w-4 mr-1" />
                          {t('auditLogsViewer', 'view', 'View')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('auditLogsViewer', 'auditLogDetails', 'Audit Log Details')}</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('auditLogsViewer', 'timestamp', 'Timestamp')}</p>
                  <p className="font-medium">{new Date(selectedLog.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('auditLogsViewer', 'ministry', 'Ministry')}</p>
                  <p className="font-medium">{ministries[selectedLog.ministry_id]?.name || t('auditLogsViewer', 'platform', 'Platform')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('auditLogsViewer', 'actorType', 'Actor Type')}</p>
                  {getActorBadge(selectedLog.actor_type)}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('auditLogsViewer', 'action', 'Action')}</p>
                  {getActionBadge(selectedLog.action)}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('auditLogsViewer', 'resourceType', 'Resource Type')}</p>
                  <Badge variant="outline">{selectedLog.resource_type}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('auditLogsViewer', 'resourceId', 'Resource ID')}</p>
                  <p className="font-mono text-xs">{selectedLog.resource_id}</p>
                </div>
              </div>

              {selectedLog.new_values && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">{t('auditLogsViewer', 'changesMade', 'Changes Made')}</p>
                  <pre className="p-3 bg-gray-100 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.new_values, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">{t('auditLogsViewer', 'metadata', 'Metadata')}</p>
                  <pre className="p-3 bg-gray-100 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <div className="text-xs text-gray-400">
                <p>{t('auditLogsViewer', 'actorId', 'Actor ID')}: {selectedLog.actor_id}</p>
                {selectedLog.ip_address && <p>{t('auditLogsViewer', 'ip', 'IP')}: {selectedLog.ip_address}</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>{t('auditLogsViewer', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLogsViewer;
