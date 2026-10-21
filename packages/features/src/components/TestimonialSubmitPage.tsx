import React, { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Checkbox } from '@rekindle/ui/checkbox';
import { useLanguage } from '../LanguageContext';
import { usePageMeta } from '../usePageMeta';
import { submitTestimonial } from '../testimonials';
import { PublicPageShell } from './PublicPageShell';

/** /testimonial — a public form for sharing what ReKindle BC has meant to
 *  you. Submissions stay hidden until a platform admin publishes them. */
const TestimonialSubmitPage: React.FC = () => {
  const { t } = useLanguage();
  usePageMeta({
    title: 'Share your story',
    description: 'Tell us how ReKindle BC has helped you or your ministry.',
  });
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [quote, setQuote] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = name.trim().length > 0 && quote.trim().length >= 10 && consent && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await submitTestimonial({ name, role, quote });
      setDone(true);
    } catch {
      setError(t('testimonial', 'error', 'Something went wrong. Please try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <PublicPageShell>
        <div className="py-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
          <h1 className="mt-4 text-2xl font-bold">{t('testimonial', 'thanksTitle', 'Thank you!')}</h1>
          <p className="mt-2 text-gray-600">
            {t('testimonial', 'thanksBody', 'We have received your story. Once our team has reviewed it, it will appear on our website.')}
          </p>
        </div>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell>
      <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
        {t('testimonial', 'title', 'Share your story')}
      </h1>
      <p className="mt-2 text-gray-600">
        {t('testimonial', 'subtitle', 'How has ReKindle BC helped you or your ministry? A few sentences is perfect.')}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="t-name">{t('testimonial', 'name', 'Your name')}</Label>
          <Input id="t-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-role">{t('testimonial', 'role', 'Your role or ministry (optional)')}</Label>
          <Input id="t-role" value={role} maxLength={120} placeholder={t('testimonial', 'rolePlaceholder', 'e.g. Bible study leader, Grace Fellowship')} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-quote">{t('testimonial', 'quote', 'Your testimonial')}</Label>
          <Textarea id="t-quote" value={quote} maxLength={600} rows={6} onChange={(e) => setQuote(e.target.value)} required />
          <p className="text-right text-xs text-gray-500">{quote.length}/600</p>
        </div>
        <label className="flex items-start gap-3 text-sm text-gray-700">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
          <span>{t('testimonial', 'consent', 'I agree that ReKindle BC may show my name, role and testimonial on its website and app.')}</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" size="lg" className="w-full bg-purple-600 hover:bg-purple-700" disabled={!canSubmit}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('testimonial', 'submit', 'Send my testimonial')}
        </Button>
      </form>
    </PublicPageShell>
  );
};

export default TestimonialSubmitPage;
