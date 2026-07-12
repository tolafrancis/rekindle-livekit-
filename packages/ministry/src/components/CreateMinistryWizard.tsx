import { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useCurrentMinistry } from '@rekindle/features/CurrentMinistryContext';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Textarea } from '@rekindle/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { toast } from '@rekindle/ui/use-toast';

// Phase 6 (6a) — church self-onboarding. A signed-in user with no ministry creates
// their org here: name + a unique handle (slug) + a few details. Creates the
// ministry_groups row and attaches the creator as admin, then lands them in it.
// Inviting leaders + CSV import happen inside the ministry (MinistryMembersManager).

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function CreateMinistryWizard({ onCreated }: { onCreated?: (id: string) => void }) {
  const { user } = useAuth();
  const { refresh } = useCurrentMinistry();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleEdited, setHandleEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [available, setAvailable] = useState<null | boolean>(null);
  const [creating, setCreating] = useState(false);

  // Keep the handle in sync with the name until the user edits it directly.
  useEffect(() => {
    if (!handleEdited) setHandle(slugify(name));
  }, [name, handleEdited]);

  // Best-effort live availability hint against the public directory (the unique index
  // is the authoritative guard at insert time; private-ministry collisions surface there).
  useEffect(() => {
    if (!handle) { setAvailable(null); return; }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('ministry_directory').select('id').eq('slug', handle).limit(1);
      if (active) setAvailable(!(data && data.length > 0));
    }, 350);
    return () => { active = false; clearTimeout(t); };
  }, [handle]);

  const canSubmit = !!user?.id && name.trim().length >= 2 && /^[a-z0-9-]{3,40}$/.test(handle) && !creating;

  const create = async () => {
    if (!canSubmit || !user?.id) return;
    setCreating(true);
    try {
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { data, error } = await supabase
        .from('ministry_groups')
        .insert({
          name: name.trim(),
          slug: handle,
          description: description.trim(),
          location: location.trim(),
          owner_id: user.id,
          leader_id: user.id,
          member_count: 1,
          is_active: true,
          is_public: true,
          join_method: 'open',
          theme_color: '#7c3aed',
          invite_code: inviteCode,
          settings: { allow_broadcasts: true },
        })
        .select()
        .single();

      if (error) {
        const taken = /uniq_ministry_groups_slug|duplicate key/i.test(error.message);
        toast({
          title: taken ? 'Handle already taken' : 'Could not create ministry',
          description: taken ? 'Please choose a different handle.' : error.message,
          variant: 'destructive',
        });
        setCreating(false);
        return;
      }

      await supabase.from('ministry_group_members').insert({
        ministry_id: data.id,
        group_id: data.id,
        user_id: user.id,
        role: 'admin',
        is_leader: true,
        joined_at: new Date().toISOString(),
      });

      toast({ title: 'Ministry created', description: `${data.name} is ready.` });
      await refresh(); // lands the creator in their new ministry
      onCreated?.(data.id);
    } catch (e: any) {
      toast({ title: 'Could not create ministry', description: e?.message, variant: 'destructive' });
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Create your ministry</CardTitle>
          <p className="text-sm text-muted-foreground">Set up your church's space in a minute.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mname">Ministry name</Label>
            <Input id="mname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Grace Chapel" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mhandle">Handle</Label>
            <div className="flex items-center gap-2">
              <Input
                id="mhandle"
                value={handle}
                onChange={(e) => { setHandleEdited(true); setHandle(slugify(e.target.value)); }}
                placeholder="grace-chapel"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">.yourproduct.com</span>
            </div>
            {handle && (
              <p className={`text-xs ${available === false ? 'text-destructive' : 'text-muted-foreground'}`}>
                {available === false ? 'That handle is taken.' : available ? 'Available.' : 'Checking…'}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mloc">Location (optional)</Label>
            <Input id="mloc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lagos, Nigeria" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mdesc">Description (optional)</Label>
            <Textarea id="mdesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <Button className="w-full" onClick={create} disabled={!canSubmit || available === false}>
            {creating ? 'Creating…' : 'Create ministry'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
