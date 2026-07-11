import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Plug, MessageCircle, Instagram, Globe, MessageSquare, Check, Loader2, Copy, CheckCheck, Facebook,
} from 'lucide-react';

interface Props { ministryId: string; ministryName: string; isLeader: boolean; }

const WEBHOOK_URL = 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/evangelism-inbox-webhook';
const FB_APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined;
const FB_CONFIG_ID = import.meta.env.VITE_FB_LOGIN_CONFIG_ID as string | undefined;
const GRAPH_VERSION = 'v21.0';

interface FbPage {
  id: string;
  name: string;
  access_token: string;
  instagram_id: string | null;
  instagram_username: string | null;
}

declare global { interface Window { FB?: any; fbAsyncInit?: () => void; } }

// Load the Facebook JS SDK once, then resolve when FB.init has run.
let fbSdkPromise: Promise<void> | null = null;
function loadFbSdk(appId: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.FB) return Promise.resolve();
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise((resolve) => {
    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, xfbml: false, version: GRAPH_VERSION });
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; (s as any).crossOrigin = 'anonymous';
    document.body.appendChild(s);
  });
  return fbSdkPromise;
}

const EvangelismChannelsPanel: React.FC<Props> = ({ ministryId, ministryName, isLeader }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<Record<string, string>>({}); // channel -> page_id
  const [waConnected, setWaConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showManual, setShowManual] = useState(!FB_APP_ID); // manual is the default only when no FB app is configured
  const [oauthBusy, setOauthBusy] = useState(false);
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null); // `${pageId}:${channel}`
  const [forms, setForms] = useState<Record<string, { pageId: string; token: string }>>({
    messenger: { pageId: '', token: '' },
    instagram: { pageId: '', token: '' },
  });

  const loadStatus = async () => {
    setLoading(true);
    try {
      const { data: cc } = await supabase
        .from('ministry_channel_configs')
        .select('channel, page_id')
        .eq('ministry_id', ministryId);
      const map: Record<string, string> = {};
      (cc || []).forEach((r: any) => { map[r.channel] = r.page_id; });
      setConfigs(map);

      const { data: wa } = await supabase
        .from('ministry_whatsapp_configs')
        .select('connection_status')
        .eq('ministry_id', ministryId)
        .maybeSingle();
      setWaConnected((wa as any)?.connection_status === 'connected');
    } catch { /* best-effort (RLS may hide configs) */ }
    finally { setLoading(false); }
  };
  useEffect(() => { loadStatus(); /* eslint-disable-next-line */ }, [ministryId]);

  // ── One-click: Facebook Login → list Pages → pick one → save + subscribe ──
  const startFacebookLogin = async () => {
    if (!FB_APP_ID) { setShowManual(true); return; }
    setOauthBusy(true);
    setPages(null);
    try {
      await loadFbSdk(FB_APP_ID);
      const loginOpts: any = FB_CONFIG_ID
        ? { config_id: FB_CONFIG_ID, response_type: 'code', override_default_response_type: true }
        : {
            response_type: 'code',
            override_default_response_type: true,
            scope: 'pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages,business_management',
          };
      const authResp: any = await new Promise((resolve) => window.FB.login((r: any) => resolve(r), loginOpts));
      const code = authResp?.authResponse?.code;
      if (!code) { toast({ title: t('evangelismChannelsPanel', 'signInCancelled', 'Sign-in cancelled') }); return; }

      const { data, error } = await supabase.functions.invoke('evangelism-connect-facebook', {
        body: { ministryId, code },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const pgs: FbPage[] = (data as any)?.pages ?? [];
      setPages(pgs);
      if (!pgs.length) toast({ title: t('evangelismChannelsPanel', 'noPagesFound', 'No Pages found'), description: t('evangelismChannelsPanel', 'noPagesFoundDesc', 'This Facebook account does not manage any Pages.') });
    } catch (e: any) {
      toast({ title: t('evangelismChannelsPanel', 'facebookSignInFailed', 'Facebook sign-in failed'), description: e.message || t('evangelismChannelsPanel', 'pleaseTryAgain', 'Please try again.'), variant: 'destructive' });
    } finally { setOauthBusy(false); }
  };

  const connectPage = async (page: FbPage, channel: 'messenger' | 'instagram') => {
    setSavingKey(`${page.id}:${channel}`);
    try {
      // The inbox webhook routes Messenger by the Facebook Page id and Instagram
      // by the Instagram account id (Meta sets entry.id to the IG account id on
      // `object: instagram` events), so store the matching id per channel.
      const pageId = channel === 'instagram' ? (page.instagram_id ?? page.id) : page.id;
      const { data, error } = await supabase.functions.invoke('evangelism-save-channel', {
        body: { ministryId, channel, pageId, accessToken: page.access_token },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const subscribed = (data as any)?.subscribed;
      const subErr = (data as any)?.subscribeError;
      toast({
        title: t('evangelismChannelsPanel', 'channelConnected', '{channel} connected').replace('{channel}', channel === 'messenger' ? 'Messenger' : 'Instagram'),
        description: subscribed
          ? t('evangelismChannelsPanel', 'messagesWillArrive', 'Messages will now arrive in your inbox.')
          : (subErr ? t('evangelismChannelsPanel', 'savedWebhookAttention', 'Saved, but the webhook needs attention: {error}').replace('{error}', String(subErr)) : t('evangelismChannelsPanel', 'saved', 'Saved.')),
        variant: subscribed ? undefined : 'destructive',
      });
      loadStatus();
    } catch (e: any) {
      toast({ title: t('evangelismChannelsPanel', 'couldNotConnect', 'Could not connect'), description: e.message || t('evangelismChannelsPanel', 'pleaseTryAgain', 'Please try again.'), variant: 'destructive' });
    } finally { setSavingKey(null); }
  };

  // ── Manual fallback (paste Page ID + token) ───────────────────────────────
  const connect = async (channel: 'messenger' | 'instagram') => {
    const form = forms[channel];
    if (!form.pageId.trim() || !form.token.trim()) {
      toast({ title: t('evangelismChannelsPanel', 'missingDetails', 'Missing details'), description: t('evangelismChannelsPanel', 'enterPageIdAndToken', 'Enter the Page ID and access token.'), variant: 'destructive' });
      return;
    }
    setBusy(channel);
    try {
      const { data, error } = await supabase.functions.invoke('evangelism-save-channel', {
        body: { ministryId, channel, pageId: form.pageId.trim(), accessToken: form.token.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: t('evangelismChannelsPanel', 'connected', 'Connected'), description: t('evangelismChannelsPanel', 'channelNowLinked', '{channel} is now linked.').replace('{channel}', channel === 'messenger' ? 'Messenger' : 'Instagram') });
      setForms((f) => ({ ...f, [channel]: { pageId: '', token: '' } }));
      loadStatus();
    } catch (e: any) {
      toast({ title: t('evangelismChannelsPanel', 'couldNotConnect', 'Could not connect'), description: e.message || t('evangelismChannelsPanel', 'checkPageIdAndToken', 'Check the Page ID and token.'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const widgetSnippet =
`<script>
(function(){
  var MINISTRY_ID="${ministryId}";
  var ENDPOINT="${WEBHOOK_URL}";
  var sid=localStorage.getItem("rk_chat_sid")||(Date.now()+"-"+Math.random().toString(36).slice(2));
  localStorage.setItem("rk_chat_sid",sid);
  // Minimal sender — wire this to your own chat UI / form:
  window.rkSendMessage=function(message,displayName){
    return fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({source:"website",ministryId:MINISTRY_ID,sessionId:sid,
        displayName:displayName||"Website Visitor",message:message})});
  };
})();
</script>`;

  const copyWidget = async () => {
    try { await navigator.clipboard.writeText(widgetSnippet); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast({ title: t('evangelismChannelsPanel', 'copyFailed', 'Copy failed') }); }
  };

  const StatusBadge = ({ on }: { on: boolean }) =>
    on ? <Badge className="bg-green-100 text-green-700"><Check className="h-3 w-3 mr-1" /> {t('evangelismChannelsPanel', 'connected', 'Connected')}</Badge>
       : <Badge variant="outline" className="text-gray-500">{t('evangelismChannelsPanel', 'notConnected', 'Not connected')}</Badge>;

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-purple-600" /></div>;

  const manualCard = (channel: 'messenger' | 'instagram', label: string, Icon: any, color: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Icon className={`h-4 w-4 ${color}`} /> {t('evangelismChannelsPanel', 'labelManual', '{label} (manual)').replace('{label}', label)}</span>
          <StatusBadge on={!!configs[channel]} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {configs[channel] && <p className="text-xs text-gray-400">{t('evangelismChannelsPanel', 'linkedPageId', 'Linked Page ID:')} <span className="font-mono">{configs[channel]}</span></p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1"><Label className="text-xs">{t('evangelismChannelsPanel', 'facebookPageId', 'Facebook Page ID')}</Label>
            <Input value={forms[channel].pageId} onChange={(e) => setForms((f) => ({ ...f, [channel]: { ...f[channel], pageId: e.target.value } }))} placeholder="1234567890" /></div>
          <div className="space-y-1"><Label className="text-xs">{t('evangelismChannelsPanel', 'pageAccessToken', 'Page access token')}</Label>
            <Input type="password" value={forms[channel].token} onChange={(e) => setForms((f) => ({ ...f, [channel]: { ...f[channel], token: e.target.value } }))} placeholder="EAAB…" /></div>
        </div>
        <Button size="sm" disabled={busy === channel} onClick={() => connect(channel)}>
          {busy === channel ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />}
          {configs[channel] ? t('evangelismChannelsPanel', 'reconnect', 'Reconnect') : t('evangelismChannelsPanel', 'connect', 'Connect')}
        </Button>
        <p className="text-[11px] text-gray-400">
          {t('evangelismChannelsPanel', 'pageMustBeSubscribed', 'The Page must be subscribed to the app webhook in Meta.')} {label === 'Instagram' ? t('evangelismChannelsPanel', 'useIgLinkedPage', 'Use the IG-linked Page’s ID and token.') : ''}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-purple-600" />
        <h2 className="text-lg font-semibold">{t('evangelismChannelsPanel', 'connectChannels', 'Connect channels')}</h2>
      </div>
      <p className="text-sm text-gray-500">
        {t('evangelismChannelsPanel', 'linkChannelsIntro', 'Link your channels so messages from members and seekers land in the {ministryName} inbox.').replace('{ministryName}', ministryName)}
      </p>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-green-600" /> WhatsApp</span>
            <StatusBadge on={waConnected} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">{t('evangelismChannelsPanel', 'manageWhatsappBefore', 'Manage your WhatsApp connection in the')} <span className="font-medium">WhatsApp</span> {t('evangelismChannelsPanel', 'manageWhatsappAfter', 'tab. Once connected, inbound messages appear here automatically.')}</p>
        </CardContent>
      </Card>

      {/* Messenger & Instagram — one-click Facebook Login */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-blue-600" /> Messenger &amp; Instagram</span>
            <span className="flex items-center gap-1">
              <Badge variant="outline" className={configs.messenger ? 'bg-green-100 text-green-700 border-transparent' : 'text-gray-500'}>
                <MessageCircle className="h-3 w-3 mr-1" />{configs.messenger ? t('evangelismChannelsPanel', 'on', 'On') : t('evangelismChannelsPanel', 'off', 'Off')}
              </Badge>
              <Badge variant="outline" className={configs.instagram ? 'bg-green-100 text-green-700 border-transparent' : 'text-gray-500'}>
                <Instagram className="h-3 w-3 mr-1" />{configs.instagram ? t('evangelismChannelsPanel', 'on', 'On') : t('evangelismChannelsPanel', 'off', 'Off')}
              </Badge>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLeader ? (
            <p className="text-sm text-gray-400">{t('evangelismChannelsPanel', 'onlyLeadersCanConnect', 'Only ministry leaders can connect channels.')}</p>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                {t('evangelismChannelsPanel', 'signInFacebookIntro', 'Sign in with the Facebook account that manages your Page, then choose the Page to link. Instagram connects through its linked Facebook Page.')}
              </p>

              {FB_APP_ID && (
                <Button onClick={startFacebookLogin} disabled={oauthBusy} className="bg-[#1877F2] hover:bg-[#1466d8] text-white">
                  {oauthBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Facebook className="h-4 w-4 mr-2" />}
                  {t('evangelismChannelsPanel', 'continueWithFacebook', 'Continue with Facebook')}
                </Button>
              )}

              {pages && pages.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium text-gray-600">{t('evangelismChannelsPanel', 'choosePageToConnect', 'Choose a Page to connect:')}</p>
                  {pages.map((p) => (
                    <div key={p.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="text-sm font-medium text-gray-800">{p.name}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={savingKey === `${p.id}:messenger`} onClick={() => connectPage(p, 'messenger')}>
                          {savingKey === `${p.id}:messenger` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-1 text-blue-600" />}
                          {t('evangelismChannelsPanel', 'connectMessenger', 'Connect Messenger')}
                        </Button>
                        {p.instagram_id ? (
                          <Button size="sm" variant="outline" disabled={savingKey === `${p.id}:instagram`} onClick={() => connectPage(p, 'instagram')}>
                            {savingKey === `${p.id}:instagram` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Instagram className="h-4 w-4 mr-1 text-pink-600" />}
                            {t('evangelismChannelsPanel', 'connectInstagram', 'Connect Instagram')}{p.instagram_username ? ` (@${p.instagram_username})` : ''}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-gray-400 self-center">{t('evangelismChannelsPanel', 'noInstagramLinked', 'No Instagram linked to this Page')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" onClick={() => setShowManual((s) => !s)} className="text-xs text-gray-500 underline hover:text-gray-700">
                {showManual ? t('evangelismChannelsPanel', 'hideManualSetup', 'Hide manual setup') : t('evangelismChannelsPanel', 'connectManuallyInstead', 'Connect manually instead (enter Page ID & token)')}
              </button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual fallback */}
      {isLeader && showManual && (
        <>
          {manualCard('messenger', 'Messenger', MessageCircle, 'text-blue-600')}
          {manualCard('instagram', 'Instagram', Instagram, 'text-pink-600')}
        </>
      )}

      {/* Website widget */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-cyan-600" /> {t('evangelismChannelsPanel', 'websiteChatWidget', 'Website chat widget')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-500">{t('evangelismChannelsPanel', 'pasteWidgetBefore', 'Paste this on your site. It posts visitor messages into your inbox (call')} <code className="text-xs">rkSendMessage(text, name)</code> {t('evangelismChannelsPanel', 'pasteWidgetAfter', 'from your chat UI).')}</p>
          <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{widgetSnippet}</pre>
          <Button size="sm" variant="outline" onClick={copyWidget}>
            {copied ? <CheckCheck className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? t('evangelismChannelsPanel', 'copied', 'Copied') : t('evangelismChannelsPanel', 'copySnippet', 'Copy snippet')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default EvangelismChannelsPanel;
