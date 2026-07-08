// src/components/AiCompanionAdminSettings.tsx
// Updated version for backend proxy - no API key validation in frontend
import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Database, 
  BarChart3, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle,
  ExternalLink,
  Shield,
  Zap,
  Server,
  Cloud
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { SpiritualCompanionService } from '@/lib/AiSpiritualCompanion';

interface SystemStats {
  totalMessages: number;
  totalSessions: number;
  activeUsers: number;
  avgMessagesPerSession: number;
  totalTokensUsed: number;
  mostPopularTopic: string;
  costEstimate: number;
}

export const AICompanionAdminSettings: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [provider, setProvider] = useState<'openai' | 'claude'>('openai');
  const [savingProvider, setSavingProvider] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    loadSystemStats();
    testBackendConnection();
    loadProvider();
  }, []);

  const loadProvider = async () => {
    const { data } = await supabase
      .from('ai_companion_settings')
      .select('provider')
      .eq('id', 1)
      .maybeSingle();
    if (data?.provider === 'claude' || data?.provider === 'openai') {
      setProvider(data.provider);
    }
  };

  const updateProvider = async (next: 'openai' | 'claude') => {
    if (next === provider || savingProvider) return;
    setSavingProvider(true);
    try {
      const { error } = await supabase
        .from('ai_companion_settings')
        .update({ provider: next, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      setProvider(next);
      toast({
        title: t('aiCompanionAdminSettings', 'providerUpdatedTitle', 'AI provider updated'),
        description: t('aiCompanionAdminSettings', 'providerUpdatedDesc', 'The companion now uses {provider}. Takes effect immediately — no redeploy needed.').replace('{provider}', next === 'claude' ? 'Anthropic Claude' : 'OpenAI GPT-4o mini'),
      });
    } catch (err: any) {
      toast({
        title: t('aiCompanionAdminSettings', 'providerUpdateErrorTitle', 'Could not update provider'),
        description: err?.message || t('aiCompanionAdminSettings', 'providerUpdateErrorDesc', 'You may lack permission, or the ai_companion_settings table has not been created yet.'),
        variant: 'destructive',
      });
    } finally {
      setSavingProvider(false);
    }
  };

  const testBackendConnection = async () => {
    setConnectionStatus('checking');
    try {
      const companion = new SpiritualCompanionService();
      const isConnected = await companion.testConnection();
      setConnectionStatus(isConnected ? 'connected' : 'disconnected');
      
      if (!isConnected) {
        toast({
          title: t('aiCompanionAdminSettings', 'backendConnIssueTitle', 'Backend Connection Issue'),
          description: t('aiCompanionAdminSettings', 'backendConnIssueDesc', 'Unable to connect to the spiritual companion backend. Please check your Supabase Edge Function deployment.'),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Connection test error:', error);
      setConnectionStatus('disconnected');
    }
  };

  const loadSystemStats = async () => {
    setIsLoadingStats(true);
    try {
      // Get total messages
      const { count: messageCount } = await supabase
        .from('ai_chat_messages')
        .select('*', { count: 'exact', head: true });

      // Get total sessions
      const { count: sessionCount } = await supabase
        .from('ai_chat_sessions')
        .select('*', { count: 'exact', head: true });

      // Get active users (users with messages in last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: activeUsersData } = await supabase
        .from('ai_chat_messages')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo);

      const uniqueUsers = new Set(activeUsersData?.map(m => m.user_id) || []);

      // Get total tokens from metadata
      const { data: messagesData } = await supabase
        .from('ai_chat_messages')
        .select('metadata');

      const totalTokens = messagesData?.reduce((sum, msg) => {
        const tokens = msg.metadata?.tokensUsed || 0;
        return sum + tokens;
      }, 0) || 0;
      
      // Estimate cost (GPT-4o mini pricing: ~$0.15 per million input tokens, ~$0.60 per million output tokens)
      // Assuming 50/50 split for simplicity
      const estimatedCost = ((totalTokens / 1000000) * 0.375).toFixed(2);

      setStats({
        totalMessages: messageCount || 0,
        totalSessions: sessionCount || 0,
        activeUsers: uniqueUsers.size,
        avgMessagesPerSession: sessionCount ? Math.round((messageCount || 0) / sessionCount) : 0,
        totalTokensUsed: totalTokens,
        mostPopularTopic: 'Prayer & Guidance',
        costEstimate: parseFloat(estimatedCost)
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      toast({
        title: t('aiCompanionAdminSettings', 'statsLoadFailedTitle', 'Stats Load Failed'),
        description: t('aiCompanionAdminSettings', 'statsLoadFailedDesc', 'Unable to load system statistics'),
        variant: 'destructive'
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const companion = new SpiritualCompanionService();
      
      // Send a simple test message
      const response = await companion.sendMessage([
        { role: 'user', content: 'Test message - please respond with "Hello"' }
      ]);

      if (response.content) {
        setTestResult('success');
        setConnectionStatus('connected');
        toast({
          title: t('aiCompanionAdminSettings', 'connSuccessTitle', 'Connection Successful'),
          description: t('aiCompanionAdminSettings', 'connSuccessDesc', 'Spiritual Companion backend is working correctly'),
          duration: 5000
        });
      } else {
        throw new Error('Empty response');
      }
    } catch (error: any) {
      console.error('Connection test failed:', error);
      setTestResult('error');
      setConnectionStatus('disconnected');
      
      toast({
        title: t('aiCompanionAdminSettings', 'connTestFailedTitle', 'Connection Test Failed'),
        description: error.message || t('aiCompanionAdminSettings', 'connTestFailedDesc', 'Unable to connect to backend service'),
        variant: 'destructive',
        duration: 7000
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `spiritual-companion-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: t('aiCompanionAdminSettings', 'exportSuccessTitle', 'Export Successful'),
        description: t('aiCompanionAdminSettings', 'exportSuccessDesc', 'Exported {count} messages').replace('{count}', String(data?.length || 0))
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: t('aiCompanionAdminSettings', 'exportFailedTitle', 'Export Failed'),
        description: t('aiCompanionAdminSettings', 'exportFailedDesc', 'Unable to export data'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">{t('aiCompanionAdminSettings', 'pageTitle', 'AI Companion Settings')}</h2>
          <p className="text-gray-600 mt-1">{t('aiCompanionAdminSettings', 'pageSubtitle', 'Manage your spiritual companion backend configuration')}</p>
        </div>
        <Badge
          variant={connectionStatus === 'connected' ? 'default' : 'destructive'}
          className="text-sm py-2 px-4"
        >
          {connectionStatus === 'checking' && `🔄 ${t('aiCompanionAdminSettings', 'statusChecking', 'Checking...')}`}
          {connectionStatus === 'connected' && `✅ ${t('aiCompanionAdminSettings', 'statusConnected', 'Connected')}`}
          {connectionStatus === 'disconnected' && `❌ ${t('aiCompanionAdminSettings', 'statusDisconnected', 'Disconnected')}`}
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <Settings className="w-4 h-4 mr-2" />
            {t('aiCompanionAdminSettings', 'tabOverview', 'Overview')}
          </TabsTrigger>
          <TabsTrigger value="backend">
            <Server className="w-4 h-4 mr-2" />
            {t('aiCompanionAdminSettings', 'tabBackend', 'Backend')}
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('aiCompanionAdminSettings', 'tabAnalytics', 'Analytics')}
          </TabsTrigger>
          <TabsTrigger value="database">
            <Database className="w-4 h-4 mr-2" />
            {t('aiCompanionAdminSettings', 'tabDatabase', 'Database')}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              {t('aiCompanionAdminSettings', 'systemStatus', 'System Status')}
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{t('aiCompanionAdminSettings', 'backendService', 'Backend Service')}</p>
                  <p className="text-sm text-gray-600">Supabase Edge Function</p>
                </div>
                <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
                  {connectionStatus === 'connected' ? t('aiCompanionAdminSettings', 'active', 'Active') : t('aiCompanionAdminSettings', 'inactive', 'Inactive')}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{t('aiCompanionAdminSettings', 'aiProvider', 'AI Provider')}</p>
                  <p className="text-sm text-gray-600">
                    {provider === 'claude' ? 'Anthropic Claude (Sonnet)' : 'OpenAI GPT-4o mini'}
                  </p>
                </div>
                <Badge variant="default">{provider === 'claude' ? 'Claude' : 'OpenAI'}</Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{t('aiCompanionAdminSettings', 'authentication', 'Authentication')}</p>
                  <p className="text-sm text-gray-600">Supabase Auth</p>
                </div>
                <Badge variant="default">{t('aiCompanionAdminSettings', 'secured', 'Secured')}</Badge>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-50 to-blue-50">
            <h3 className="text-xl font-semibold mb-4">{t('aiCompanionAdminSettings', 'systemFeatures', 'System Features')}</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span><strong>Christ-centered</strong> responses rooted in Scripture</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span><strong>Secure backend</strong> - API keys stored server-side</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span><strong>User authentication</strong> required for all requests</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span><strong>Context-aware</strong> conversation history</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span><strong>Scripture references</strong> automatically extracted</span>
              </li>
            </ul>
          </Card>
        </TabsContent>

        {/* Backend Tab */}
        <TabsContent value="backend" className="space-y-6">
          <Alert>
            <Cloud className="w-4 h-4" />
            <AlertDescription>
              {t('aiCompanionAdminSettings', 'backendProxyNote', 'The spiritual companion uses a secure backend proxy (Supabase Edge Function) to talk to the AI provider. API keys are never exposed in the browser.')}
            </AlertDescription>
          </Alert>

          {/* AI Provider toggle */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-1">{t('aiCompanionAdminSettings', 'aiProvider', 'AI Provider')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('aiCompanionAdminSettings', 'aiProviderChoose', 'Choose which model powers the spiritual companion. Changes apply immediately — no redeploy needed.')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={savingProvider}
                onClick={() => updateProvider('openai')}
                className={`p-4 rounded-lg border-2 text-left transition-all disabled:opacity-60 ${
                  provider === 'openai' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">OpenAI</span>
                  {provider === 'openai' && <CheckCircle className="w-4 h-4 text-purple-600" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">GPT-4o mini · requires OPENAI_API_KEY</p>
              </button>

              <button
                type="button"
                disabled={savingProvider}
                onClick={() => updateProvider('claude')}
                className={`p-4 rounded-lg border-2 text-left transition-all disabled:opacity-60 ${
                  provider === 'claude' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Anthropic Claude</span>
                  {provider === 'claude' && <CheckCircle className="w-4 h-4 text-purple-600" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">Claude Sonnet · requires ANTHROPIC_API_KEY</p>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {savingProvider
                ? t('aiCompanionAdminSettings', 'saving', 'Saving…')
                : t('aiCompanionAdminSettings', 'currentlyActive', 'Currently active: {provider}').replace('{provider}', provider === 'claude' ? 'Anthropic Claude' : 'OpenAI GPT-4o mini')}
            </p>
          </Card>

          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">{t('aiCompanionAdminSettings', 'backendConfiguration', 'Backend Configuration')}</h3>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">{t('aiCompanionAdminSettings', 'connectionStatus', 'Connection Status')}</Label>
                <div className="mt-2 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {connectionStatus === 'connected' ? `✅ ${t('aiCompanionAdminSettings', 'backendConnected', 'Backend Connected')}` : `❌ ${t('aiCompanionAdminSettings', 'backendDisconnected', 'Backend Disconnected')}`}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {connectionStatus === 'connected'
                          ? t('aiCompanionAdminSettings', 'edgeFnResponding', 'Edge Function is responding correctly')
                          : t('aiCompanionAdminSettings', 'edgeFnUnreachable', 'Unable to reach Edge Function - check deployment')}
                      </p>
                    </div>
                    <Button
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      variant="outline"
                      size="sm"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isTesting ? 'animate-spin' : ''}`} />
                      {t('aiCompanionAdminSettings', 'test', 'Test')}
                    </Button>
                  </div>
                </div>
              </div>

              {testResult && (
                <Alert variant={testResult === 'success' ? 'default' : 'destructive'}>
                  <AlertDescription>
                    {testResult === 'success'
                      ? `✅ ${t('aiCompanionAdminSettings', 'testSuccessMsg', 'Connection test successful! Backend is working correctly.')}`
                      : `❌ ${t('aiCompanionAdminSettings', 'testFailedMsg', 'Connection test failed. Please check your Supabase Edge Function deployment.')}`}
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">{t('aiCompanionAdminSettings', 'deploymentInfo', 'Deployment Information')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">{t('aiCompanionAdminSettings', 'functionName', 'Function Name:')}</span>
                    <code className="font-mono">spiritual-companion</code>
                  </div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">{t('aiCompanionAdminSettings', 'endpoint', 'Endpoint:')}</span>
                    <code className="font-mono text-xs">/functions/v1/spiritual-companion</code>
                  </div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">{t('aiCompanionAdminSettings', 'authenticationLabel', 'Authentication:')}</span>
                    <span className="font-medium">{t('aiCompanionAdminSettings', 'requiredBearer', 'Required (Bearer Token)')}</span>
                  </div>
                </div>
              </div>

              <Alert>
                <Shield className="w-4 h-4" />
                <AlertDescription className="text-sm">
                  <strong>{t('aiCompanionAdminSettings', 'securityNoteLabel', 'Security Note:')}</strong> {t('aiCompanionAdminSettings', 'securityNoteBody', 'The Anthropic API key is stored securely in Supabase secrets, not in the browser. All requests are authenticated using Supabase Auth.')}
                </AlertDescription>
              </Alert>

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">{t('aiCompanionAdminSettings', 'setupInstructions', 'Setup Instructions')}</h4>
                <p className="text-sm text-gray-600 mb-3">
                  {t('aiCompanionAdminSettings', 'setupIntro', 'To deploy or update the backend, follow these steps:')}
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                  <li>{t('aiCompanionAdminSettings', 'stepInstallCli', 'Install Supabase CLI:')} <code className="bg-gray-100 px-1 rounded">npm install -g supabase</code></li>
                  <li>{t('aiCompanionAdminSettings', 'stepDeployFn', 'Deploy function:')} <code className="bg-gray-100 px-1 rounded">supabase functions deploy spiritual-companion</code></li>
                  <li>{t('aiCompanionAdminSettings', 'stepSetKey', 'Set API key:')} <code className="bg-gray-100 px-1 rounded">supabase secrets set ANTHROPIC_API_KEY=your_key</code></li>
                </ol>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => window.open('https://supabase.com/docs/guides/functions', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {t('aiCompanionAdminSettings', 'viewSupabaseDocs', 'View Supabase Docs')}
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">{t('aiCompanionAdminSettings', 'systemStatistics', 'System Statistics')}</h3>
            <Button
              onClick={loadSystemStats}
              disabled={isLoadingStats}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingStats ? 'animate-spin' : ''}`} />
              {t('aiCompanionAdminSettings', 'refresh', 'Refresh')}
            </Button>
          </div>

          {stats ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 font-medium">{t('aiCompanionAdminSettings', 'totalMessages', 'Total Messages')}</p>
                      <p className="text-3xl font-bold mt-1 text-blue-900">
                        {stats.totalMessages.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-2xl bg-blue-200">📝</Badge>
                  </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 font-medium">{t('aiCompanionAdminSettings', 'totalSessions', 'Total Sessions')}</p>
                      <p className="text-3xl font-bold mt-1 text-purple-900">
                        {stats.totalSessions.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-2xl bg-purple-200">💬</Badge>
                  </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 font-medium">{t('aiCompanionAdminSettings', 'activeUsers30d', 'Active Users (30d)')}</p>
                      <p className="text-3xl font-bold mt-1 text-green-900">
                        {stats.activeUsers.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-2xl bg-green-200">👥</Badge>
                  </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-amber-50 to-amber-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 font-medium">{t('aiCompanionAdminSettings', 'avgMessagesSession', 'Avg Messages/Session')}</p>
                      <p className="text-3xl font-bold mt-1 text-amber-900">
                        {stats.avgMessagesPerSession}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-2xl bg-amber-200">📊</Badge>
                  </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-indigo-50 to-indigo-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 font-medium">{t('aiCompanionAdminSettings', 'totalTokensUsed', 'Total Tokens Used')}</p>
                      <p className="text-3xl font-bold mt-1 text-indigo-900">
                        {stats.totalTokensUsed.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-2xl bg-indigo-200">🔢</Badge>
                  </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-pink-50 to-pink-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 font-medium">{t('aiCompanionAdminSettings', 'estimatedCost', 'Estimated Cost')}</p>
                      <p className="text-3xl font-bold mt-1 text-pink-900">
                        ${stats.costEstimate}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-2xl bg-pink-200">💰</Badge>
                  </div>
                </Card>
              </div>

              <Card className="p-6">
                <h4 className="font-semibold mb-2">{t('aiCompanionAdminSettings', 'costBreakdown', 'Cost Breakdown')}</h4>
                <p className="text-sm text-gray-600">
                  {t('aiCompanionAdminSettings', 'costBasis', 'Based on GPT-4o mini pricing (~$0.38 average per million tokens)')}
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('aiCompanionAdminSettings', 'tokensUsedLabel', 'Tokens used:')}</span>
                    <span className="font-medium">{stats.totalTokensUsed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('aiCompanionAdminSettings', 'costPerMillion', 'Cost per million:')}</span>
                    <span className="font-medium">~$9.00</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>{t('aiCompanionAdminSettings', 'totalEstimatedCost', 'Total estimated cost:')}</span>
                    <span className="text-purple-600">${stats.costEstimate}</span>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{t('aiCompanionAdminSettings', 'loadingStatistics', 'Loading statistics...')}</p>
            </div>
          )}
        </TabsContent>

        {/* Database Tab */}
        <TabsContent value="database" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">{t('aiCompanionAdminSettings', 'databaseSchema', 'Database Schema')}</h3>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-3 text-base">{t('aiCompanionAdminSettings', 'tablesCreated', 'Tables Created')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">ai_chat_sessions</p>
                      <p className="text-xs text-gray-600">{t('aiCompanionAdminSettings', 'tableSessionsDesc', 'User conversation sessions')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">ai_chat_messages</p>
                      <p className="text-xs text-gray-600">{t('aiCompanionAdminSettings', 'tableMessagesDesc', 'Chat messages & responses')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">ai_usage_logs</p>
                      <p className="text-xs text-gray-600">{t('aiCompanionAdminSettings', 'tableUsageDesc', 'Usage analytics & token tracking')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3 text-base">{t('aiCompanionAdminSettings', 'dataManagement', 'Data Management')}</h4>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-gray-600">{t('aiCompanionAdminSettings', 'exportConversationData', 'Export Conversation Data')}</Label>
                    <p className="text-xs text-gray-500 mb-2 mt-1">
                      {t('aiCompanionAdminSettings', 'exportDataDesc', 'Export up to 1,000 recent messages for analysis or backup (JSON format)')}
                    </p>
                    <Button onClick={handleExportData} variant="outline" size="sm">
                      <Database className="w-4 h-4 mr-2" />
                      {t('aiCompanionAdminSettings', 'exportData', 'Export Data')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Alert>
            <Shield className="w-4 h-4" />
            <AlertDescription className="text-sm">
              <strong>{t('aiCompanionAdminSettings', 'securityPrivacyLabel', 'Security & Privacy:')}</strong> {t('aiCompanionAdminSettings', 'securityPrivacyBody', 'All data is protected by Row Level Security (RLS). Users can only access their own conversations. API keys are stored securely in Supabase secrets, not in the browser.')}
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  );
};