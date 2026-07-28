import { useState } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@rekindle/features/LanguageContext';

interface Props {
  themeColor?: string;
}

// Shared "how to submit automatically" collapsible guide — shown in both the
// Donations tab (MinistryGiftAidDashboard, alongside the manual-filing guide)
// and the Claims tab (GiftAidClaimsManager, where the actual Submit to HMRC
// button lives), so it's visible wherever an admin is likely to be looking.
export function GiftAidAutoSubmitGuide({ themeColor = '#7c3aed' }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="flex items-center gap-2 font-medium">
          <HelpCircle className="h-4 w-4" style={{ color: themeColor }} />
          {t('giftAidAutoSubmitGuide', 'howToSubmitAuto', 'How to submit a claim automatically from the app')}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <CardContent className="pt-0 text-sm text-gray-600 space-y-2">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>{t('giftAidAutoSubmitGuide', 'autoStep1', 'Click')} <span className="font-medium">{t('giftAidAutoSubmitGuide', 'bundleEligibleDonations', 'Bundle eligible donations')}</span> {t('giftAidAutoSubmitGuide', 'autoStep1Post', 'on the Claims tab to pack every eligible, unclaimed donation in the period into a new draft claim.')}</li>
            <li>{t('giftAidAutoSubmitGuide', 'autoStep2', 'Open the claim and check the donation list — anything flagged')} <span className="font-medium">{t('giftAidAutoSubmitGuide', 'missingLabel', 'Missing')}</span> {t('giftAidAutoSubmitGuide', 'autoStep2Post', 'should be fixed first (ask the donor to complete their Gift Aid declaration), or HMRC may reject it.')}</li>
            <li>{t('giftAidAutoSubmitGuide', 'autoStep3Pre', 'Click')} <span className="font-medium">{t('giftAidAutoSubmitGuide', 'submitToHmrc', 'Submit to HMRC')}</span> {t('giftAidAutoSubmitGuide', 'autoStep3Post', "and sign in with your ministry's Government Gateway user ID and password (the same login your charity uses on gov.uk) — the app files it directly with HMRC Charities Online, no spreadsheet needed.")}</li>
            <li>{t('giftAidAutoSubmitGuide', 'autoStep4', 'The claim moves to')} <span className="font-medium">{t('giftAidAutoSubmitGuide', 'submittedLabel', 'Submitted')}</span>{t('giftAidAutoSubmitGuide', 'autoStep4Post', '. Come back and click')} <span className="font-medium">{t('giftAidAutoSubmitGuide', 'checkHmrcStatus', 'Check HMRC status')}</span> {t('giftAidAutoSubmitGuide', 'autoStep4Post2', 'any time to see if HMRC has accepted or rejected it — no need to check the HMRC website separately.')}</li>
          </ol>
          <p className="text-xs text-gray-500">
            {t('giftAidAutoSubmitGuide', 'autoGuideNote', "Your Government Gateway password is sent securely for that one submission only — it's never stored. If you'd rather not connect HMRC credentials here, use the CSV/XML export buttons on a claim and file it yourself on gov.uk instead.")}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export default GiftAidAutoSubmitGuide;
