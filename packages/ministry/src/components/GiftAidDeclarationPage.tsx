import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { useAuth } from '@rekindle/features/AuthContext';
import { Building2, CheckCircle2, HandCoins, Loader2 } from 'lucide-react';
import { loadGiftAidSettings, submitGiftAidDeclaration } from '../giftAid';
import {
  GiftAidDeclarationFields,
  emptyGiftAidState,
  isGiftAidDeclarationComplete,
  type GiftAidFormState,
} from './GiftAidDeclarationFields';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PublicMinistry {
  id: string;
  name: string;
  logoUrl: string | null;
}

/**
 * Public Gift Aid declaration page: rekindlebc.com/gift-aid/:slug, shared as a
 * link or QR code (Gift Aid dashboard > Declarations). For donors who give by
 * cash, envelope or bank transfer and so never see the donation form. Records
 * the same declaration, wording and evidence (server-side IP, device) as the
 * donation form, through the gift-aid-declaration function, which needs no
 * sign-in.
 */
const GiftAidDeclarationPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ministry, setMinistry] = useState<PublicMinistry | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [charityName, setCharityName] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [giftAid, setGiftAid] = useState<GiftAidFormState>({ ...emptyGiftAidState, optedIn: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('validate_join', { p_slug: slug ?? '', p_code: '', p_version: null });
        const row = (data as any[] | null)?.[0];
        if (cancelled || !row?.ministry_id) return;
        setMinistry({ id: row.ministry_id, name: row.name, logoUrl: row.logo_url });
        const settings = await loadGiftAidSettings(row.ministry_id);
        if (cancelled) return;
        setEnabled(settings.enabled);
        setCharityName(settings.charityName);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const signedInEmail = (user as any)?.email as string | undefined;
    if (signedInEmail && !email) setEmail(signedInEmail);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) { setError('Please enter a valid email address. It\'s how the church matches your gifts to this declaration.'); return; }
    if (!giftAid.optedIn) { setError('Tick "Add Gift Aid" to make a declaration.'); return; }
    if (!isGiftAidDeclarationComplete(giftAid)) {
      setError('Please add your name, home address (house number or name, and postcode) and confirm you are a UK taxpayer.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitGiftAidDeclaration({
        ministryId: ministry!.id,
        donorUserId: user?.id || null,
        donorEmail: trimmed,
        title: giftAid.title,
        firstName: giftAid.firstName,
        lastName: giftAid.lastName,
        houseNumberOrName: giftAid.houseNumberOrName,
        addressLine1: giftAid.addressLine1,
        city: giftAid.city,
        postcode: giftAid.postcode.trim().toUpperCase(),
        isTaxpayerConfirmed: giftAid.taxpayerConfirmed,
        source: 'gift_aid_link',
      });
      if (res.ok) setDone(true);
      else setError(res.error || 'We couldn\'t save your declaration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white px-4 py-10">
      <div className="mx-auto max-w-lg space-y-5">
        {ministry && (
          <div className="flex items-center gap-3">
            {ministry.logoUrl
              ? <img src={ministry.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
              : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100"><Building2 className="h-6 w-6 text-purple-600" /></div>}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Gift Aid declaration</p>
              <h1 className="text-xl font-bold text-gray-900">{ministry.name}</h1>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;
  }

  if (!ministry) {
    return shell(<p className="rounded-lg border bg-white p-5 text-gray-700">We couldn't find this church. Please check the link or QR code you were given.</p>);
  }

  if (!enabled) {
    return shell(<p className="rounded-lg border bg-white p-5 text-gray-700">{ministry.name} isn't collecting Gift Aid declarations at the moment.</p>);
  }

  if (done) {
    return shell(
      <div className="space-y-3 rounded-xl border bg-white p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="text-lg font-semibold">Thank you, your declaration is recorded</h2>
        <p className="text-sm text-gray-600">
          {charityName || ministry.name} can now claim an extra 25p from HMRC for every £1 you give, on your gifts from
          the past 4 years and from now on, at no cost to you.
        </p>
        <p className="text-sm text-gray-600">
          Please use <strong>{email.trim().toLowerCase()}</strong> when you give, so your gifts are matched to this declaration.
          If you stop paying enough UK tax, or change your name or home address, please let the church know.
        </p>
      </div>,
    );
  }

  return shell(
    <div className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex items-start gap-3 rounded-lg bg-purple-50 p-3 text-sm text-purple-900">
        <HandCoins className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          If you're a UK taxpayer, Gift Aid lets {charityName || ministry.name} claim 25p from HMRC for every £1 you give,
          at no extra cost to you. One declaration covers your past 4 years of gifts and all future ones.
        </p>
      </div>

      <div>
        <Label htmlFor="ga-email">Email address *</Label>
        <Input
          id="ga-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <p className="mt-1 text-xs text-gray-500">Use the same email you give with, so the church can match your gifts.</p>
      </div>

      <GiftAidDeclarationFields value={giftAid} onChange={setGiftAid} charityName={charityName || ministry.name} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button className="w-full" onClick={() => void submit()} disabled={submitting}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        Make my Gift Aid declaration
      </Button>
      <p className="text-center text-xs text-gray-500">
        Your details are kept as a record for HMRC and are only used for Gift Aid. <a href="/privacy" className="underline">Privacy Policy</a>
      </p>
    </div>,
  );
};

export default GiftAidDeclarationPage;
