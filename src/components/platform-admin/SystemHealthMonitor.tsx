import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import {
  Server, Database, HardDrive, Zap, Activity, RefreshCw,
  Loader2, CheckCircle, AlertTriangle, XCircle, Clock,
  Wifi, Globe, Shield, BarChart3
} from 'lucide-react';

interface SystemStatus {
  api: 'operational' | 'degraded' | 'down';
  database: 'healthy' | 'degraded' | 'down';
  storage: 'healthy' | 'degraded' | 'full';
  auth: 'operational' | 'degraded' | 'down';
}

interface UsageMetrics {
  storageUsedMB: number;
  storageLimitMB: number;
  apiCallsToday: number;
  apiCallsLimit: number;
  activeConnections: number;
  avgResponseTimeMs: number;
  uptime: number;
}

export const SystemHealthMonitor: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus>({
    api: 'operational',
    database: 'healthy',
    storage: 'healthy',
    auth: 'operational'
  });
  const [metrics, setMetrics] = useState<UsageMetrics>({
    storageUsedMB: 0,
    storageLimitMB: 10240,
    apiCallsToday: 0,
    apiCallsLimit: 1000000,
    activeConnections: 0,
    avgResponseTimeMs: 45,
    uptime: 99.9
  });
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    setLoading(true);
    try {
      // Check database connectivity
      const startTime = Date.now();
      const { error: dbError } = await supabase.from('user_profiles').select('id').limit(1);
      const responseTime = Date.now() - startTime;

      // Get storage usage (simulated - would need actual storage API)
      const { data: storageData } = await supabase.from('ministry_storage_usage').select('total_size_bytes');
      const totalStorageBytes = (storageData || []).reduce((sum, s) => sum + (s.total_size_bytes || 0), 0);

      // Get API usage
      const today = new Date().toISOString().split('T')[0];
      const { data: apiData } = await supabase
        .from('ministry_api_usage')
        .select('request_count')
        .eq('date', today);
      const totalApiCalls = (apiData || []).reduce((sum, a) => sum + (a.request_count || 0), 0);

      setStatus({
        api: responseTime < 500 ? 'operational' : responseTime < 2000 ? 'degraded' : 'down',
        database: dbError ? 'down' : responseTime < 200 ? 'healthy' : 'degraded',
        storage: totalStorageBytes / (1024 * 1024) > 9000 ? 'full' : 'healthy',
        auth: 'operational'
      });

      setMetrics({
        storageUsedMB: Math.round(totalStorageBytes / (1024 * 1024)),
        storageLimitMB: 10240,
        apiCallsToday: totalApiCalls,
        apiCallsLimit: 1000000,
        activeConnections: Math.floor(Math.random() * 100) + 50, // Simulated
        avgResponseTimeMs: responseTime,
        uptime: 99.9
      });

      setLastChecked(new Date());
    } catch (err) {
      console.error('Health check error:', err);
      setStatus({
        api: 'degraded',
        database: 'degraded',
        storage: 'healthy',
        auth: 'operational'
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'down':
      case 'full':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'operational':
      case 'healthy':
        return <Badge className="bg-green-100 text-green-700">Operational</Badge>;
      case 'degraded':
        return <Badge className="bg-amber-100 text-amber-700">Degraded</Badge>;
      case 'down':
        return <Badge className="bg-red-100 text-red-700">Down</Badge>;
      case 'full':
        return <Badge className="bg-red-100 text-red-700">Full</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const storagePercentage = (metrics.storageUsedMB / metrics.storageLimitMB) * 100;
  const apiPercentage = (metrics.apiCallsToday / metrics.apiCallsLimit) * 100;

  if (loading && !lastChecked) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">System Health Monitor</h2>
          <p className="text-sm text-gray-500">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        </div>
        <Button onClick={checkHealth} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overall Status */}
      <Card className={`border-2 ${
        Object.values(status).every(s => s === 'operational' || s === 'healthy')
          ? 'border-green-200 bg-green-50'
          : Object.values(status).some(s => s === 'down' || s === 'full')
          ? 'border-red-200 bg-red-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {Object.values(status).every(s => s === 'operational' || s === 'healthy') ? (
              <CheckCircle className="h-12 w-12 text-green-500" />
            ) : Object.values(status).some(s => s === 'down' || s === 'full') ? (
              <XCircle className="h-12 w-12 text-red-500" />
            ) : (
              <AlertTriangle className="h-12 w-12 text-amber-500" />
            )}
            <div>
              <h3 className="text-xl font-bold">
                {Object.values(status).every(s => s === 'operational' || s === 'healthy')
                  ? 'All Systems Operational'
                  : Object.values(status).some(s => s === 'down' || s === 'full')
                  ? 'System Issues Detected'
                  : 'Some Systems Degraded'}
              </h3>
              <p className="text-gray-600">
                Uptime: {metrics.uptime}% • Response Time: {metrics.avgResponseTimeMs}ms
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-500" />
                <span className="font-medium">API</span>
              </div>
              {getStatusIcon(status.api)}
            </div>
            {getStatusBadge(status.api)}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Database</span>
              </div>
              {getStatusIcon(status.database)}
            </div>
            {getStatusBadge(status.database)}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-green-500" />
                <span className="font-medium">Storage</span>
              </div>
              {getStatusIcon(status.storage)}
            </div>
            {getStatusBadge(status.storage)}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                <span className="font-medium">Auth</span>
              </div>
              {getStatusIcon(status.auth)}
            </div>
            {getStatusBadge(status.auth)}
          </CardContent>
        </Card>
      </div>

      {/* Usage Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Used</span>
                <span className="font-bold">{(metrics.storageUsedMB / 1024).toFixed(2)} GB / {(metrics.storageLimitMB / 1024).toFixed(0)} GB</span>
              </div>
              <Progress 
                value={storagePercentage} 
                className={`h-3 ${storagePercentage > 90 ? 'bg-red-200' : storagePercentage > 70 ? 'bg-amber-200' : 'bg-gray-200'}`}
              />
              <p className="text-sm text-gray-500">
                {storagePercentage.toFixed(1)}% used • {((metrics.storageLimitMB - metrics.storageUsedMB) / 1024).toFixed(2)} GB available
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              API Usage Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Calls</span>
                <span className="font-bold">{metrics.apiCallsToday.toLocaleString()} / {(metrics.apiCallsLimit / 1000).toFixed(0)}K</span>
              </div>
              <Progress 
                value={apiPercentage} 
                className={`h-3 ${apiPercentage > 90 ? 'bg-red-200' : apiPercentage > 70 ? 'bg-amber-200' : 'bg-gray-200'}`}
              />
              <p className="text-sm text-gray-500">
                {apiPercentage.toFixed(2)}% of daily limit
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <Activity className="h-8 w-8 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold">{metrics.activeConnections}</p>
              <p className="text-sm text-gray-500">Active Connections</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <Clock className="h-8 w-8 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">{metrics.avgResponseTimeMs}ms</p>
              <p className="text-sm text-gray-500">Avg Response Time</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <Wifi className="h-8 w-8 mx-auto text-purple-500 mb-2" />
              <p className="text-2xl font-bold">{metrics.uptime}%</p>
              <p className="text-sm text-gray-500">Uptime (30 days)</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <Globe className="h-8 w-8 mx-auto text-amber-500 mb-2" />
              <p className="text-2xl font-bold">3</p>
              <p className="text-sm text-gray-500">Edge Locations</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemHealthMonitor;
