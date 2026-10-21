import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, MessageCircle, ScrollText } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { useLanguage } from '../LanguageContext';
import { FaqList } from './FaqList';
import { usePageMeta } from '../usePageMeta';

const SUPPORT_EMAIL = 'support@rekindlebc.com';
// Optional: a WhatsApp number people can message for help. The button only
// shows when it is set, so the devotional-delivery bot number is never used
// for support by accident.
const SUPPORT_WHATSAPP = (import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER ?? '').replace(/[^\d]/g, '');

/** /faq and /help — how to reach us, then the full FAQ. Reachable from the
 *  Ministries hub, the ministry app header and the landing page footer. */
const FaqPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  usePageMeta({
    title: 'Help & Support',
    description: 'Get help with ReKindle BC: contact our support team, read the Rekindle Guide, or find answers for individual believers and ministry leaders.',
  });
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const emailHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('ReKindle help request')}`;

  const card = 'flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/60';
  const iconWrap = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={goBack}>
        <ArrowLeft className="mr-1 h-4 w-4" />{t('common', 'back', 'Back')}
      </Button>
      <div>
        <h1 className="text-2xl font-bold">{t('faq', 'helpTitle', 'Help & support')}</h1>
        <p className="mt-1 text-base text-muted-foreground">
          {t('faq', 'helpSubtitle', 'Stuck on something? A real person on the ReKindle team will help you.')}
        </p>
      </div>

      <section aria-labelledby="contact-us" className="space-y-3">
        <h2 id="contact-us" className="text-lg font-semibold">{t('faq', 'contactUs', 'Contact us')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href={emailHref} className={card}>
            <span className={`${iconWrap} bg-indigo-600`}><Mail className="h-5 w-5" /></span>
            <span>
              <span className="block font-medium">{t('faq', 'emailUs', 'Email us')}</span>
              <span className="block text-sm text-muted-foreground break-all">{SUPPORT_EMAIL}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t('faq', 'emailTip', 'Tell us what you were trying to do and, if you can, add a screenshot.')}
              </span>
            </span>
          </a>
          {SUPPORT_WHATSAPP && (
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className={card}>
              <span className={`${iconWrap} bg-green-600`}><MessageCircle className="h-5 w-5" /></span>
              <span>
                <span className="block font-medium">{t('faq', 'whatsappUs', 'Message us on WhatsApp')}</span>
                <span className="block text-sm text-muted-foreground">+{SUPPORT_WHATSAPP}</span>
              </span>
            </a>
          )}
          <button type="button" onClick={() => navigate('/guide')} className={card}>
            <span className={`${iconWrap} bg-amber-500`}><ScrollText className="h-5 w-5" /></span>
            <span>
              <span className="block font-medium">{t('faq', 'readGuide', 'Read the Rekindle Guide')}</span>
              <span className="block text-sm text-muted-foreground">
                {t('faq', 'readGuideDesc', 'Step-by-step help for every part of the app.')}
              </span>
            </span>
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('faq', 'ministryQuestions', 'Questions about your ministry itself, such as meeting times or membership, are best asked to your ministry leader.')}
        </p>
      </section>

      <section aria-labelledby="faq-heading" className="space-y-3">
        <h2 id="faq-heading" className="text-lg font-semibold">{t('faq', 'title', 'Frequently asked questions')}</h2>
        <FaqList />
      </section>
    </div>
  );
};

export default FaqPage;
