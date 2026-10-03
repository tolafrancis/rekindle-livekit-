import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Textarea } from '@rekindle/ui/textarea';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { LiveChannel, CHANNEL_CATEGORIES, ChannelCategory } from '@rekindle/types/liveChannelTypes';

// Owner / ministry-admin editor for a channel's details: name, description,
// category, logo and cover, plus hide and delete. Stream settings stay in
// ChannelStreamConfig. The 14-day rename limit and who may edit are enforced
// in the database (0396); this mirrors them so the form explains itself.

const RENAME_COOLDOWN_DAYS = 14;

interface ChannelDetailsDialogProps {
  channel: LiveChannel;
  open: boolean;
  onClose: () => void;
  /** Called after a save or delete so the list can reload. */
  onChanged: () => void;
}

const nextRenameDate = (changedAt?: string | null): Date | null => {
  if (!changedAt) return null;
  const next = new Date(new Date(changedAt).getTime() + RENAME_COOLDOWN_DAYS * 86400000);
  return next > new Date() ? next : null;
};

export const ChannelDetailsDialog: React.FC<ChannelDetailsDialogProps> = ({ channel, open, onClose, onChanged }) => {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description || '');
  const [category, setCategory] = useState<ChannelCategory>(channel.category);
  const [logoUrl, setLogoUrl] = useState(channel.channel_logo_url || '');
  const [coverUrl, setCoverUrl] = useState(channel.featured_image_url || '');
  const [isActive, setIsActive] = useState(channel.is_active !== false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(channel.name);
    setDescription(channel.description || '');
    setCategory(channel.category);
    setLogoUrl(channel.channel_logo_url || '');
    setCoverUrl(channel.featured_image_url || '');
    setIsActive(channel.is_active !== false);
    setConfirmDelete('');
  }, [open, channel]);

  const renameLockedUntil = nextRenameDate(channel.name_changed_at);

  const upload = async (file: File, kind: 'logo' | 'cover') => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image.', variant: 'destructive' });
      return;
    }
    setUploading(kind);
    try {
      const bucket = kind === 'logo' ? 'channel-logos' : 'channel-featured';
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user?.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
      if (kind === 'logo') setLogoUrl(publicUrl); else setCoverUrl(publicUrl);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Name required', description: 'Give your channel a name.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        description: description.trim() || null,
        category,
        channel_logo_url: logoUrl || null,
        featured_image_url: coverUrl || null,
        is_active: isActive,
      };
      if (trimmed !== channel.name) patch.name = trimmed;
      const { data, error } = await supabase.from('live_channels').update(patch).eq('id', channel.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("You don't have permission to edit this channel.");
      toast({ title: 'Channel updated' });
      onChanged();
      onClose();
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.from('live_channels').delete().eq('id', channel.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("You don't have permission to delete this channel.");
      toast({ title: 'Channel deleted' });
      onChanged();
      onClose();
    } catch (err: any) {
      toast({ title: "Couldn't delete", description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const ImageField = ({ kind, label, url }: { kind: 'logo' | 'cover'; label: string; url: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {url ? (
          <img src={url} alt="" className={kind === 'logo' ? 'h-14 w-14 rounded-full object-cover border' : 'h-14 w-24 rounded-md object-cover border'} />
        ) : (
          <div className={kind === 'logo' ? 'h-14 w-14 rounded-full bg-gray-100 border' : 'h-14 w-24 rounded-md bg-gray-100 border'} />
        )}
        <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer rounded-md border px-3 py-2 hover:bg-gray-50">
          {uploading === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {url ? 'Change' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" disabled={uploading !== null}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, kind); e.target.value = ''; }} />
        </label>
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => (kind === 'logo' ? setLogoUrl('') : setCoverUrl(''))}>Remove</Button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving && !deleting) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit channel</DialogTitle>
          <DialogDescription>Followers, recordings and the channel link stay the same.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Name</Label>
            <Input id="channel-name" value={name} maxLength={80} disabled={!!renameLockedUntil}
              onChange={e => setName(e.target.value)} />
            <p className="text-xs text-gray-500">
              {renameLockedUntil
                ? `Renamed recently. You can change the name again on ${renameLockedUntil.toLocaleDateString()}.`
                : `You can rename your channel once every ${RENAME_COOLDOWN_DAYS} days.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-description">Description</Label>
            <Textarea id="channel-description" rows={3} maxLength={1000} value={description}
              onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={v => setCategory(v as ChannelCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {ImageField({ kind: 'logo', label: 'Logo', url: logoUrl })}
          {ImageField({ kind: 'cover', label: 'Cover image', url: coverUrl })}

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label>Show channel publicly</Label>
              <p className="text-xs text-gray-500 mt-1">Turn off to hide it from everyone else. Nothing is deleted.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-red-800">Delete channel</p>
            <p className="text-xs text-red-700">
              This permanently removes the channel, its followers, events and recordings. Type <strong>{channel.name}</strong> to confirm.
            </p>
            <Input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} placeholder={channel.name} />
            <Button type="button" variant="destructive" size="sm" onClick={remove}
              disabled={deleting || channel.is_live || confirmDelete.trim() !== channel.name}>
              {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete channel
            </Button>
            {channel.is_live && <p className="text-xs text-red-700">End the live broadcast before deleting.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={save} disabled={saving || deleting || uploading !== null}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChannelDetailsDialog;
