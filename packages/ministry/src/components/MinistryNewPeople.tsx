import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Input } from '@rekindle/ui/input';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { CheckCircle2, Loader2, Mail, MessageCircle, Phone, Undo2, UserPlus } from 'lucide-react';

// Settings › Members › New people: everyone who joined recently, so the team
// can welcome them, and a record of who has been contacted
// (ministry_followups, 0413). Leaders also get a Monday reminder while
// anyone from the last 30 days is still waiting.

interface Props {
  ministryId: string;
}

interface Person {
  key: string;
  name: string;
  email: string;
  phone: string;
  joinedAt: string;
}

interface Followup {
  person_key: string;
  contacted_at: string;
  note: string | null;
}

const RANGES = [30, 90] as const;

const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export const MinistryNewPeople: React.FC<Props> = ({ ministryId }) => {
  const { t } = useLanguage();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [people, setPeople] = useState<Person[]>([]);
  const [followups, setFollowups] = useState<Record<string, Followup>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - range * 86_400_000).toISOString();
    try {
      const [{ data: ministry }, { data: members, error }, { data: registrants }, { data: done }] = await Promise.all([
        supabase.from('ministry_groups').select('owner_id, leader_id').eq('id', ministryId).single(),
        supabase
          .from('ministry_members_with_profiles')
          .select('user_id, role, is_leader, joined_at, user_full_name, user_email, user_phone')
          .eq('ministry_id', ministryId)
          .gte('joined_at', since),
        supabase
          .from('ministry_member_profiles')
          .select('id, user_id, first_name, last_name, preferred_name, email, mobile_number, approved_at, created_at')
          .eq('ministry_id', ministryId)
          .eq('registration_status', 'active')
          .gte('created_at', since),
        supabase.from('ministry_followups').select('person_key, contacted_at, note').eq('ministry_id', ministryId),
      ]);
      if (error) throw error;

      const team = new Set([ministry?.owner_id, ministry?.leader_id].filter(Boolean));
      const byKey = new Map<string, Person>();
      for (const m of (members ?? []) as any[]) {
        if (!m.user_id || m.is_leader || ['admin', 'moderator'].includes(m.role) || team.has(m.user_id)) continue;
        byKey.set(String(m.user_id), {
          key: String(m.user_id),
          name: m.user_full_name || m.user_email || t('newPeople', 'unnamed', 'New member'),
          email: m.user_email || '',
          phone: m.user_phone || '',
          joinedAt: m.joined_at,
        });
      }
      // Registrants (QR / public form). Same person as a member above when
      // they have an account: keep one entry, filling in what's missing.
      for (const p of (registrants ?? []) as any[]) {
        const key = p.user_id ? String(p.user_id) : String(p.id);
        if (p.user_id && team.has(p.user_id)) continue;
        const name = [p.preferred_name || p.first_name, p.last_name].filter(Boolean).join(' ').trim();
        const existing = byKey.get(key);
        byKey.set(key, {
          key,
          name: existing?.name || name || p.email || t('newPeople', 'unnamed', 'New member'),
          email: existing?.email || p.email || '',
          phone: existing?.phone || p.mobile_number || '',
          joinedAt: existing?.joinedAt || p.approved_at || p.created_at,
        });
      }
      setPeople([...byKey.values()].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)));
      setFollowups(Object.fromEntries(((done ?? []) as Followup[]).map((f) => [f.person_key, f])));
    } catch (e: any) {
      toast({ title: t('newPeople', 'loadFailed', 'Could not load new people'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [ministryId, range]);

  const markContacted = async (person: Person) => {
    setBusy(person.key);
    const note = notes[person.key]?.trim() || null;
    const { error } = await supabase
      .from('ministry_followups')
      .upsert({ ministry_id: ministryId, person_key: person.key, note, contacted_at: new Date().toISOString() }, { onConflict: 'ministry_id,person_key' });
    setBusy(null);
    if (error) return toast({ title: t('newPeople', 'saveFailed', 'Could not save'), description: error.message, variant: 'destructive' });
    setFollowups((prev) => ({ ...prev, [person.key]: { person_key: person.key, contacted_at: new Date().toISOString(), note } }));
  };

  const undo = async (person: Person) => {
    setBusy(person.key);
    const { error } = await supabase.from('ministry_followups').delete().eq('ministry_id', ministryId).eq('person_key', person.key);
    setBusy(null);
    if (error) return toast({ title: t('newPeople', 'saveFailed', 'Could not save'), description: error.message, variant: 'destructive' });
    setFollowups((prev) => {
      const next = { ...prev };
      delete next[person.key];
      return next;
    });
  };

  const waiting = people.filter((p) => !followups[p.key]);
  const contacted = people.filter((p) => followups[p.key]);

  const joinedLabel = (iso: string) => {
    const d = daysAgo(iso);
    if (d === 0) return t('newPeople', 'joinedToday', 'Joined today');
    if (d === 1) return t('newPeople', 'joinedYesterday', 'Joined yesterday');
    return t('newPeople', 'joinedDaysAgo', 'Joined {n} days ago').replace('{n}', String(d));
  };

  const contactButtons = (p: Person) => {
    const digits = p.phone.replace(/[^\d]/g, '');
    return (
      <div className="flex flex-wrap gap-2">
        {/* wa.me needs the international number, so only offer it when the phone was saved with one. */}
        {p.phone.trim().startsWith('+') && digits && (
          <Button asChild size="sm" variant="outline">
            <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-4 w-4 text-green-600" />WhatsApp</a>
          </Button>
        )}
        {digits && (
          <Button asChild size="sm" variant="outline">
            <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}><Phone className="mr-1.5 h-4 w-4" />{t('newPeople', 'call', 'Call')}</a>
          </Button>
        )}
        {p.email && (
          <Button asChild size="sm" variant="outline">
            <a href={`mailto:${p.email}`}><Mail className="mr-1.5 h-4 w-4" />{t('newPeople', 'email', 'Email')}</a>
          </Button>
        )}
        {!digits && !p.email && <span className="text-xs text-muted-foreground">{t('newPeople', 'noContact', 'No phone or email saved')}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('newPeople', 'title', 'New people')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('newPeople', 'subtitle', 'Everyone who joined recently. Get in touch, then mark them as contacted so the team knows. While anyone is waiting, leaders get a reminder every Monday.')}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-sm ${range === r ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
            >
              {t('newPeople', 'lastDays', 'Last {n} days').replace('{n}', String(r))}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <CardTitle className="text-base">{t('newPeople', 'waiting', 'Waiting for a welcome')}</CardTitle>
              {waiting.length > 0 && <Badge>{waiting.length}</Badge>}
            </CardHeader>
            <CardContent className="space-y-3">
              {waiting.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <UserPlus className="h-4 w-4" />
                  {people.length === 0
                    ? t('newPeople', 'nobodyNew', 'Nobody new in this period.')
                    : t('newPeople', 'allContacted', 'Everyone has been contacted. Well done!')}
                </p>
              )}
              {waiting.map((p) => (
                <div key={p.key} className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{joinedLabel(p.joinedAt)}</span>
                  </div>
                  {contactButtons(p)}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={notes[p.key] ?? ''}
                      maxLength={500}
                      placeholder={t('newPeople', 'notePlaceholder', 'Note (optional), e.g. "Called, coming on Sunday"')}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    />
                    <Button onClick={() => markContacted(p)} disabled={busy === p.key} className="shrink-0">
                      {busy === p.key ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                      {t('newPeople', 'markContacted', 'Mark as contacted')}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {contacted.length > 0 && (
            <Card>
              <CardHeader className="space-y-0">
                <CardTitle className="text-base">
                  {t('newPeople', 'contacted', 'Contacted')} <span className="font-normal text-muted-foreground">({contacted.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contacted.map((p) => {
                  const f = followups[p.key];
                  return (
                    <div key={p.key} className="flex items-start gap-3 rounded-md border px-3 py-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {joinedLabel(p.joinedAt)} · {t('newPeople', 'contactedOn', 'contacted {date}').replace('{date}', new Date(f.contacted_at).toLocaleDateString())}
                        </p>
                        {f.note && <p className="mt-1 text-sm">{f.note}</p>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => undo(p)} disabled={busy === p.key} aria-label={t('newPeople', 'undo', 'Undo')}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default MinistryNewPeople;
