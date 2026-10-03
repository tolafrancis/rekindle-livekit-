import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/use-toast';
import { Loader2, Smartphone } from 'lucide-react';
import {
  APP_DOWNLOAD_LINK_FIELDS,
  loadAppDownloadLinks,
  saveAppDownloadLinks,
  type AppDownloadLinks,
} from '@rekindle/features/appDownloadLinks';

// Platform admin editor for the landing page's store / download buttons
// (packages/features/src/appDownloadLinks.ts). Empty fields hide that button.

const isValidUrl = (v: string) => {
  if (!v) return true;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
};

export const AppDownloadLinksManager: React.FC = () => {
  const [links, setLinks] = useState<AppDownloadLinks | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAppDownloadLinks().then(setLinks); }, []);

  const save = async () => {
    if (!links) return;
    const bad = APP_DOWNLOAD_LINK_FIELDS.find(f => !isValidUrl(links[f.key].trim()));
    if (bad) {
      toast({ title: 'Check the link', description: `${bad.label} must be a full https:// link.`, variant: 'destructive' });
      return;
    }
    setSaving(true);
    const trimmed = Object.fromEntries(
      APP_DOWNLOAD_LINK_FIELDS.map(f => [f.key, links[f.key].trim()]),
    ) as unknown as AppDownloadLinks;
    const { error } = await saveAppDownloadLinks(trimmed);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error, variant: 'destructive' });
      return;
    }
    setLinks(trimmed);
    toast({ title: 'Download links saved', description: 'The landing page shows them straight away.' });
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5" />
          App download links
        </CardTitle>
        <p className="text-sm text-gray-500">
          Shown on the landing page of rekindlebc.com and app.rekindlebc.com. Leave a field empty to hide that button.
        </p>
      </CardHeader>
      <CardContent>
        {!links ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-4">
            {APP_DOWNLOAD_LINK_FIELDS.map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`dl-${f.key}`}>{f.label}</Label>
                <Input
                  id={`dl-${f.key}`}
                  type="url"
                  inputMode="url"
                  placeholder={f.placeholder}
                  value={links[f.key]}
                  onChange={e => setLinks({ ...links, [f.key]: e.target.value })}
                  className={isValidUrl(links[f.key].trim()) ? '' : 'border-red-400'}
                />
              </div>
            ))}
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save links
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AppDownloadLinksManager;
