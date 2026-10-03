import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { useLanguage } from '../LanguageContext';
import { FaqList } from './FaqList';

/** /faq — the full FAQ, reachable from the Ministries hub (and by link). */
const FaqPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={goBack}>
        <ArrowLeft className="mr-1 h-4 w-4" />{t('common', 'back', 'Back')}
      </Button>
      <div>
        <h1 className="text-2xl font-bold">{t('faq', 'title', 'Frequently asked questions')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('faq', 'subtitle', 'Answers for individual believers and ministry leaders. Still stuck? Email support@rekindlebc.com.')}
        </p>
      </div>
      <FaqList />
    </div>
  );
};

export default FaqPage;
