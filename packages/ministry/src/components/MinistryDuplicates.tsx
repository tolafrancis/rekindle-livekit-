import React, { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Loader2, Users2, GitMerge, ShieldCheck, RefreshCw } from 'lucide-react';

interface DupRow {
  match_type: string;
  group_key: string;
  profile_id: string;
  display_name: string | null;
  email: string | null;
  mobile_number: string | null;
  date_of_birth: string | null;
  registration_status: string;
  created_at: string;
}

interface Cluster {
  key: string;
  match_type: string;
  rows: DupRow[];
}

const MinistryDuplicates: React.FC<{ ministryId: string }> = ({ ministryId }) => {
  const { t } = useLanguage();
  const matchLabel = (mt: string) => {
    switch (mt) {
      case 'phone': return t('ministryDuplicates', 'matchPhone', 'Same phone number');
      case 'email': return t('ministryDuplicates', 'matchEmail', 'Same email');
      case 'name_dob': return t('ministryDuplicates', 'matchNameDob', 'Same name & date of birth');
      default: return mt;
    }
  };
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [survivor, setSurvivor] = useState<Record<string, string>>({}); // clusterKey -> profile_id
  const [merging, setMerging] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('find_duplicate_candidates', { p_ministry_id: ministryId });
      if (error) throw error;
      const rows: DupRow[] = data || [];
      const map = new Map<string, Cluster>();
      for (const r of rows) {
        const key = `${r.match_type}::${r.group_key}`;
        if (!map.has(key)) map.set(key, { key, match_type: r.match_type, rows: [] });
        map.get(key)!.rows.push(r);
      }
      const list = Array.from(map.values());
      setClusters(list);
      // default survivor = oldest (first) in each cluster
      const def: Record<string, string> = {};
      list.forEach((c) => { def[c.key] = c.rows[0]?.profile_id; });
      setSurvivor(def);
    } catch (e: any) {
      toast({ title: t('ministryDuplicates', 'loadFailed', 'Could not load duplicates'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ministryId]);

  const mergeCluster = async (c: Cluster) => {
    const keep = survivor[c.key];
    if (!keep) return;
    const others = c.rows.filter((r) => r.profile_id !== keep);
    if (others.length === 0) return;
    const keepName = c.rows.find(r => r.profile_id === keep)?.display_name || t('ministryDuplicates', 'selected', 'selected');
    const confirmMsg =
      t('ministryDuplicates', 'mergeConfirm', 'Merge {count} record(s) into "{name}"?')
        .replace('{count}', String(others.length))
        .replace('{name}', String(keepName))
      + '\n\n'
      + t('ministryDuplicates', 'mergeConfirmWarning', 'This cannot be undone (a snapshot is kept in the merge log).');
    if (!window.confirm(confirmMsg)) return;

    setMerging(c.key);
    try {
      for (const o of others) {
        const { error } = await supabase.rpc('merge_member_profiles', {
          p_surviving: keep, p_merged: o.profile_id,
        });
        if (error) throw error;
      }
      toast({ title: t('ministryDuplicates', 'merged', 'Merged'), description: t('ministryDuplicates', 'mergedDesc', 'Duplicate records were combined.') });
      await load();
    } catch (e: any) {
      toast({ title: t('ministryDuplicates', 'mergeFailed', 'Merge failed'), description: e.message, variant: 'destructive' });
    } finally {
      setMerging(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-purple-600" /></div>;
  }

  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <ShieldCheck className="h-10 w-10 text-green-500 mx-auto mb-3" />
        <p className="font-medium text-gray-700">{t('ministryDuplicates', 'noneFound', 'No possible duplicates found')}</p>
        <p className="text-sm">{t('ministryDuplicates', 'noneFoundDesc', 'Members aren’t sharing a phone, email, or name + date of birth.')}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> {t('ministryDuplicates', 'rescan', 'Re-scan')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {t('ministryDuplicates', 'groupsSummary', '{count} possible duplicate group(s). Pick the record to keep, then merge.').replace('{count}', String(clusters.length))}
        </p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> {t('ministryDuplicates', 'rescan', 'Re-scan')}</Button>
      </div>

      {clusters.map((c) => (
        <div key={c.key} className="border rounded-xl p-4 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <Users2 className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-gray-800">{matchLabel(c.match_type)}</span>
            <Badge variant="secondary">{c.rows.length}</Badge>
          </div>
          <div className="space-y-2">
            {c.rows.map((r) => (
              <label key={r.profile_id} className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name={`keep-${c.key}`}
                  checked={survivor[c.key] === r.profile_id}
                  onChange={() => setSurvivor((s) => ({ ...s, [c.key]: r.profile_id }))}
                  className="accent-purple-600"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.display_name || t('ministryDuplicates', 'unnamedRecord', 'Unnamed record')}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {[r.mobile_number, r.email, r.date_of_birth].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">{r.registration_status}</Badge>
                {survivor[c.key] === r.profile_id && <Badge className="bg-green-100 text-green-700">{t('ministryDuplicates', 'keep', 'Keep')}</Badge>}
              </label>
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <Button size="sm" disabled={merging === c.key} onClick={() => mergeCluster(c)}>
              {merging === c.key ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitMerge className="h-4 w-4 mr-1" />}
              {t('ministryDuplicates', 'mergeIntoKept', 'Merge into kept record')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MinistryDuplicates;
