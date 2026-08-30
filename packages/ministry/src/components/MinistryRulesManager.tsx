import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Badge } from '@rekindle/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { ScrollText, Plus, Edit, Trash2, Loader2, ChevronUp, ChevronDown, Upload, History, CheckCircle2 } from 'lucide-react';

interface MinistryRulesManagerProps {
  ministryId: string;
}

interface RuleItem {
  id: string;
  title: string;
  body: string;
  sort_order: number;
}

interface RulesConfig {
  require_acceptance: boolean;
  current_version: number;
}

interface VersionRow {
  version: number;
  published_at: string;
  accepted_count: number;
}

/**
 * Admin CRUD for a ministry's itemized rules/guidelines — draft items
 * (version=0) are edited freely and don't affect what members see or are
 * gated on until "Publish" bumps the version (publish_ministry_rules RPC,
 * migration 0296). Reached both from MinistrySpace's main nav (admin view
 * of the 'rules' tab) and from MinistryManagement's "Manage Ministry"
 * shell, same dual-access pattern every other admin manager in this
 * package follows (see MinistryAnnouncementsManager).
 */
export const MinistryRulesManager: React.FC<MinistryRulesManagerProps> = ({ ministryId }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RuleItem[]>([]);
  const [config, setConfig] = useState<RulesConfig>({ require_acceptance: false, current_version: 0 });
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [memberCount, setMemberCount] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<RuleItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: cfg }, { data: draftItems, error: itemsErr }, { count: members }] = await Promise.all([
        supabase.from('ministry_rules').select('require_acceptance, current_version').eq('ministry_id', ministryId).maybeSingle(),
        supabase.from('ministry_rule_items').select('id, title, body, sort_order').eq('ministry_id', ministryId).eq('version', 0).order('sort_order'),
        supabase.from('ministry_group_members').select('*', { count: 'exact', head: true }).eq('ministry_id', ministryId),
      ]);
      if (itemsErr) throw itemsErr;
      setConfig({
        require_acceptance: cfg?.require_acceptance || false,
        current_version: cfg?.current_version || 0,
      });
      setItems(draftItems || []);
      setMemberCount(members || 0);

      const { data: versionRows, error: versErr } = await supabase
        .from('ministry_rule_versions')
        .select('version, published_at')
        .eq('ministry_id', ministryId)
        .order('version', { ascending: false });
      if (versErr) throw versErr;

      const withCounts = await Promise.all((versionRows || []).map(async (v) => {
        const { count } = await supabase
          .from('ministry_rule_acceptances')
          .select('*', { count: 'exact', head: true })
          .eq('ministry_id', ministryId)
          .eq('accepted_version', v.version);
        return { ...v, accepted_count: count || 0 };
      }));
      setVersions(withCounts);
    } catch (err: any) {
      console.error('[MinistryRulesManager] load failed:', err);
      toast({ title: 'Could not load rules', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [ministryId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingItem(null);
    setFormTitle('');
    setFormBody('');
    setShowModal(true);
  };

  const openEdit = (item: RuleItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormBody(item.body);
    setShowModal(true);
  };

  const saveItem = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      toast({ title: 'A title and description are both required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('ministry_rule_items')
          .update({ title: formTitle.trim(), body: formBody.trim(), updated_at: new Date().toISOString() })
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const nextOrder = items.length ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
        const { error } = await supabase
          .from('ministry_rule_items')
          .insert({ ministry_id: ministryId, version: 0, title: formTitle.trim(), body: formBody.trim(), sort_order: nextOrder });
        if (error) throw error;
      }
      toast({ title: editingItem ? 'Rule updated' : 'Rule added', description: 'Draft only — publish to make this visible to members.' });
      setShowModal(false);
      load();
    } catch (err: any) {
      toast({ title: 'Could not save rule', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: RuleItem) => {
    if (!window.confirm(`Remove "${item.title}" from the draft?`)) return;
    try {
      const { error } = await supabase.from('ministry_rule_items').delete().eq('id', item.id);
      if (error) throw error;
      toast({ title: 'Rule removed from draft' });
      load();
    } catch (err: any) {
      toast({ title: 'Could not remove rule', description: err.message, variant: 'destructive' });
    }
  };

  // Simple neighbor-swap reorder — no drag-and-drop dependency in this repo,
  // and a list of rules is short enough that up/down arrows are plenty.
  const moveItem = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const a = items[index];
    const b = items[targetIndex];
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setItems(next);
    try {
      await Promise.all([
        supabase.from('ministry_rule_items').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('ministry_rule_items').update({ sort_order: a.sort_order }).eq('id', b.id),
      ]);
    } catch (err: any) {
      toast({ title: 'Could not reorder rules', description: err.message, variant: 'destructive' });
      load();
    }
  };

  const toggleRequireAcceptance = async (on: boolean) => {
    setConfig(prev => ({ ...prev, require_acceptance: on }));
    try {
      const { error } = await supabase
        .from('ministry_rules')
        .upsert({ ministry_id: ministryId, require_acceptance: on }, { onConflict: 'ministry_id' });
      if (error) throw error;
    } catch (err: any) {
      setConfig(prev => ({ ...prev, require_acceptance: !on }));
      toast({ title: 'Could not update setting', description: err.message, variant: 'destructive' });
    }
  };

  const publish = async () => {
    if (items.length === 0) {
      toast({ title: 'Add at least one rule before publishing', variant: 'destructive' });
      return;
    }
    setPublishing(true);
    try {
      const { data, error } = await supabase.rpc('publish_ministry_rules', { p_ministry_id: ministryId });
      if (error) throw error;
      toast({ title: `Published as version ${data}`, description: 'Members who accepted an older version will be asked to accept again.' });
      load();
    } catch (err: any) {
      toast({ title: 'Could not publish', description: err.message, variant: 'destructive' });
    } finally {
      setPublishing(false);
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
            <ScrollText className="h-5 w-5 text-indigo-600" />
            {t('ministryRules', 'title', 'Rules & Guidelines')}
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage the rules members see. Changes here are a draft — publish to make them live.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Rule
        </Button>
      </div>

      <Card>
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={config.require_acceptance}
              disabled={config.current_version < 1}
              onCheckedChange={toggleRequireAcceptance}
            />
            <div>
              <p className="text-sm font-medium">Require members to accept these rules</p>
              <p className="text-xs text-muted-foreground">
                {config.current_version < 1
                  ? 'Publish at least one version before this can be turned on.'
                  : 'When on, members must accept the current version before using ministry features.'}
              </p>
            </div>
          </div>
          <Badge variant={config.current_version >= 1 ? 'success' : 'secondary'}>
            {config.current_version >= 1 ? `Live: v${config.current_version}` : 'Not published yet'}
          </Badge>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            No rules yet. Add one, then Publish when you're ready for members to see it.
          </CardContent></Card>
        )}
        {items.map((item, idx) => (
          <Card key={item.id}>
            <CardContent className="py-3 flex items-start gap-3">
              <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-0.5">{item.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => deleteItem(item)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={publish} disabled={publishing || items.length === 0} className="w-full sm:w-auto">
        {publishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
        Publish new version
      </Button>

      {versions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-600" /> Version history
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {versions.map(v => (
              <div key={v.version} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={v.version === config.current_version ? 'success' : 'outline'}>v{v.version}</Badge>
                  <span className="text-muted-foreground">{new Date(v.published_at).toLocaleString()}</span>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {v.accepted_count}/{memberCount} members accepted
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Community Standards, Privacy, Participation" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={formBody} onChange={e => setFormBody(e.target.value)} rows={5} placeholder="What this rule expects from members…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={saveItem} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryRulesManager;
