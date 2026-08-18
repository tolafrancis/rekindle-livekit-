import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { HardDrive, Plus, Loader2, Copy, Trash2, AlertTriangle } from 'lucide-react';

interface MinistryTranslationDeviceListProps {
  ministryId: string;
}

interface DeviceRow {
  id: string;
  name: string;
  status: 'active' | 'revoked';
  firmware: string | null;
  last_ping: string | null;
  created_at: string;
}

const relativePing = (iso: string | null) => {
  if (!iso) return 'Never connected';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// Devices are idle until Phase 4 (PA system add-on) — this UI is built now
// per docs/rlt-build-checklist.md § Phase 1.4, "Build DeviceList component
// (register, show key once, revoke) — UI only, idle until Phase 4," so
// Phase 4 ships with zero dashboard work left.
export const MinistryTranslationDeviceList: React.FC<MinistryTranslationDeviceListProps> = ({ ministryId }) => {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<DeviceRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('translation_devices')
        .select('id, name, status, firmware, last_ping, created_at')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDevices(data || []);
    } catch (err: any) {
      console.error('[MinistryTranslationDeviceList] load failed:', err);
      toast({ title: 'Could not load devices', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [ministryId]);

  useEffect(() => { load(); }, [load]);

  const openRegister = () => {
    setDeviceName('');
    setNewRawKey(null);
    setShowRegister(true);
  };

  const register = async () => {
    if (!deviceName.trim()) return;
    setRegistering(true);
    try {
      const { data, error } = await supabase.rpc('register_translation_device', {
        p_ministry_id: ministryId,
        p_name: deviceName.trim(),
      });
      if (error) throw error;
      setNewRawKey(data.device_key);
      load();
    } catch (err: any) {
      console.error('[MinistryTranslationDeviceList] register failed:', err);
      toast({ title: 'Could not register device', description: err.message, variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
  };

  const copyKey = () => {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey).then(() => toast({ title: 'Device key copied' }));
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const { error } = await supabase.rpc('revoke_translation_device', { p_device_id: revokeTarget.id });
      if (error) throw error;
      toast({ title: 'Device revoked' });
      setRevokeTarget(null);
      load();
    } catch (err: any) {
      toast({ title: 'Could not revoke device', description: err.message, variant: 'destructive' });
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-indigo-600" />
            Edge Agent Devices
          </h3>
          <p className="text-sm text-muted-foreground">
            For the PA system add-on (Phase 4). Register a church PC here, install the edge agent, and paste the
            key in on first run.
          </p>
        </div>
        <Button onClick={openRegister}><Plus className="h-4 w-4 mr-1.5" /> Register Device</Button>
      </div>

      {devices.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No devices registered yet.
        </CardContent></Card>
      )}

      {devices.map(device => (
        <Card key={device.id}>
          <CardContent className="flex items-center justify-between py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{device.name}</span>
                <Badge variant={device.status === 'active' ? 'default' : 'secondary'}>{device.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {relativePing(device.last_ping)}{device.firmware ? ` · v${device.firmware}` : ''}
              </p>
            </div>
            {device.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(device)}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={showRegister} onOpenChange={(open) => { setShowRegister(open); if (!open) setNewRawKey(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register a Device</DialogTitle></DialogHeader>
          {!newRawKey ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Device name</Label>
                <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. Sound Booth PC" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This key is shown once. Copy it now and paste it into the edge agent's setup wizard — it can't be
                  retrieved again after you close this dialog.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs break-all">{newRawKey}</code>
                <Button variant="outline" size="sm" onClick={copyKey}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
          <DialogFooter>
            {!newRawKey ? (
              <>
                <Button variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
                <Button onClick={register} disabled={registering || !deviceName.trim()}>
                  {registering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Register
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowRegister(false)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Revoke "{revokeTarget?.name}"?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Its key stops working immediately. This can't be undone — you'd need to register a new device.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRevoke} disabled={revoking}>
              {revoking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryTranslationDeviceList;
