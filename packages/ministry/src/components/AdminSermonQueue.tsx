import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';

interface Row {
  id: string;
  title: string;
  speaker: string | null;
  status: string | null;
  processing_error: string | null;
  source_url: string | null;
  created_at: string | null;
  retry_count: number | null;
}

export const AdminSermonQueue: React.FC<{ ministryId: string }> = ({ ministryId }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ministry_sermon_library')
        .select('id, title, speaker, status, processing_error, source_url, created_at, retry_count')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setRows((data || []) as Row[]);
    } catch (err: any) {
      console.error('[AdminSermonQueue] load failed', err);
      toast({ title: 'Could not load queue', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId]);

  const retry = async (r: Row) => {
    try {
      const nextCount = (r.retry_count || 0) + 1;
      const { error } = await supabase
        .from('ministry_sermon_library')
        .update({ status: 'pending', processing_error: null, retry_count: nextCount })
        .eq('id', r.id);
      if (error) throw error;
      toast({ title: 'Retry queued', description: `${r.title} will be retried.` });
      await load();
    } catch (err: any) {
      console.error('[AdminSermonQueue] retry failed', err);
      toast({ title: 'Retry failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcription Job Queue</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && <div className="text-sm text-muted-foreground">No recent jobs.</div>}

        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-semibold">{r.title || '(untitled)'}</div>
                  <div className="text-sm text-muted-foreground">{r.speaker || 'Unknown speaker'}</div>
                  <div className="text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">Status: <span className="font-medium">{r.status || 'unknown'}</span></div>
                  <div className="text-xs text-muted-foreground">Retries: {r.retry_count || 0}</div>
                </div>
              </div>

              {r.processing_error && (
                <div className="mt-2 text-sm text-red-600">Error: {r.processing_error}</div>
              )}

              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => retry(r)}>Retry</Button>
                {r.source_url && (
                  <Button size="sm" variant="outline" onClick={() => window.open(r.source_url || '', '_blank')}>Open Source</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminSermonQueue;
