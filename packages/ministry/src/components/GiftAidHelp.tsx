import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@rekindle/ui/accordion';
import { toast } from '@rekindle/ui/use-toast';
import { supabase } from '@rekindle/supabase';
import { publicWebOrigin } from '@rekindle/features/platform';
import { generateQrPngDataUrl } from '@rekindle/features/qrCode';
import { Copy, Download, ExternalLink, HelpCircle, Lightbulb, Link2, Loader2, QrCode } from 'lucide-react';

// =============================================================================
// Gift Aid help: the shareable declaration link, a step-by-step guide to using
// Gift Aid in the app, and a plain-English FAQ on HMRC's rules. Shown as the
// Help tab of the Gift Aid dashboard; GiftAidShareLink also sits on the
// Declarations tab.
// =============================================================================

/** The ministry's public Gift Aid declaration page and its QR code. */
export const GiftAidShareLink: React.FC<{ ministryId: string; ministryName?: string; themeColor?: string; compact?: boolean }> = ({
  ministryId, ministryName, themeColor = '#7c3aed', compact = false,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_ministry_join_slug', { mid: ministryId }).then(async ({ data }) => {
      if (cancelled || !data) return;
      const link = `${publicWebOrigin()}/gift-aid/${data}`;
      setUrl(link);
      try { const png = await generateQrPngDataUrl(link, 800); if (!cancelled) setQr(png); } catch { /* QR is optional */ }
    });
    return () => { cancelled = true; };
  }, [ministryId]);

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast({ title: 'Link copied' }); }
    catch { toast({ title: 'Couldn\'t copy', description: url }); }
  };

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `gift-aid-declaration-qr${ministryName ? `-${ministryName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}.png`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" style={{ color: themeColor }} /> Gift Aid declaration link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-gray-600">
          Share this with anyone who gives by cash, envelope or bank transfer. They fill in their details online
          and their declaration appears under Declarations, with no paper form. Print the QR code on envelopes,
          notice boards or the screen.
        </p>
        {!url ? (
          <p className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading link…</p>
        ) : (
          <div className={compact ? 'space-y-2' : 'flex flex-col gap-4 sm:flex-row sm:items-start'}>
            {qr && !compact && <img src={qr} alt="Gift Aid declaration QR code" className="h-40 w-40 rounded-lg border" />}
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="sm" className="h-10" onClick={() => void copy()}><Copy className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={downloadQr} disabled={!qr}><QrCode className="mr-1 h-4 w-4" /> Download QR code</Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-4 w-4" /> Open page</a>
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface HelpProps {
  ministryId: string;
  ministryName?: string;
  themeColor?: string;
  onGoToSettings?: () => void;
}

const Section: React.FC<{ value: string; title: string; children: React.ReactNode }> = ({ value, title, children }) => (
  <AccordionItem value={value}>
    <AccordionTrigger className="text-left text-sm font-medium">{title}</AccordionTrigger>
    <AccordionContent className="space-y-2 text-sm leading-relaxed text-gray-700">{children}</AccordionContent>
  </AccordionItem>
);

export const GiftAidHelp: React.FC<HelpProps> = ({ ministryId, ministryName, themeColor = '#7c3aed', onGoToSettings }) => (
  <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">Gift Aid in four steps</p>
        <p>
          <strong>1.</strong> Set up Gift Aid in Settings &gt; Finance &amp; Billing.{' '}
          <strong>2.</strong> Collect declarations: donation form, the link below, registration, or paper forms + Import CSV.{' '}
          <strong>3.</strong> Make sure every gift is recorded: online gifts are automatic; add cash and transfers with Import CSV.{' '}
          <strong>4.</strong> Build a claim in Claims, check it, then submit to HMRC or download the CSV and file it yourself.
        </p>
      </div>
    </div>

    <GiftAidShareLink ministryId={ministryId} ministryName={ministryName} themeColor={themeColor} />

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" style={{ color: themeColor }} /> Using Gift Aid in Rekindle
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          <Section value="setup" title="1. Setting up (one time)">
            <p>Gift Aid appears for ministries whose country is the United Kingdom. In <strong>Settings &gt; Finance &amp; Billing</strong>, switch on Gift Aid and fill in:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Charity name</strong> as registered.</li>
              <li><strong>HMRC charity reference</strong>, the reference HMRC gave you when it recognised the charity for tax (letters then numbers, e.g. AB12345). Without HMRC recognition you can't claim Gift Aid.</li>
              <li><strong>Charity regulator</strong> and registration number (Charity Commission, OSCR, CCNI), or "none" if exempt or excepted.</li>
              <li><strong>Authorised official</strong>: the person HMRC knows as responsible for claims, with their phone number and postcode.</li>
              <li><strong>Claim reference prefix</strong>, used to label your claims, and the <strong>submission method</strong>.</li>
            </ul>
            {onGoToSettings && <Button variant="outline" size="sm" onClick={onGoToSettings}>Open Gift Aid settings</Button>}
          </Section>

          <Section value="declarations" title="2. Collecting declarations">
            <p>A donor must make a Gift Aid declaration before you can claim on their gifts. Rekindle records them electronically, with no signature needed, and keeps the evidence HMRC expects: the exact wording they agreed to, their name and home address, the date and time, and the device and IP address. There are four ways in:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>When giving online:</strong> the donation form offers "Add Gift Aid".</li>
              <li><strong>The declaration link or QR code</strong> (above): for people who give cash, by envelope or by bank transfer.</li>
              <li><strong>Member registration and the kiosk:</strong> UK members who tick Gift Aid make a full declaration.</li>
              <li><strong>Paper forms:</strong> key them in with <strong>Declarations &gt; Import CSV</strong> (or add one at a time on the Declarations tab). Keep the signed paper copies.</li>
            </ul>
            <p>Declarations can't be deleted, because they're your audit evidence. If a donor's details change, <strong>correct</strong> it (a new version replaces the old one, which is kept). If they stop paying enough tax or ask to stop, <strong>withdraw</strong> it.</p>
          </Section>

          <Section value="gifts" title="3. Recording every gift">
            <p>Gifts made through the app or website are recorded automatically. For anything else, such as cash and envelope collections, bank transfers, standing orders or another giving platform, use <strong>Donations &gt; Import CSV</strong>.</p>
            <p><strong>Email is the link</strong> between a gift and a declaration. Use the same email for a donor in both. If a donor has no email, make one up and use it in both files, e.g. <code>jane.smith.0042@noemail.local</code>.</p>
            <p>The import shows every row before saving, skips gifts already recorded, and flags gifts that won't be claimable yet because the donor has no declaration.</p>
          </Section>

          <Section value="review" title="4. Reviewing what you can claim">
            <p>The <strong>Donations</strong> tab lists every gift with a verdict and an estimate of the Gift Aid (25% of the gift):</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Eligible:</strong> ready to go into a claim.</li>
              <li><strong>No active declaration:</strong> the donor hasn't declared yet, or used a different email. Send them the declaration link.</li>
              <li><strong>Anonymous donation:</strong> HMRC needs the donor's identity, so anonymous gifts can't be claimed.</li>
              <li><strong>Payment not completed:</strong> the payment hasn't gone through.</li>
              <li><strong>Excluded by admin:</strong> you excluded it, for example a gift for a ticket or something the donor received in return. You can include it again.</li>
            </ul>
          </Section>

          <Section value="claim" title="5. Building and checking a claim">
            <p>On the <strong>Claims</strong> tab, build a claim for a date range. It gathers every eligible gift not already claimed, then checks each line against HMRC's rules: donor name, house number or name, a valid UK postcode with its space (e.g. SW1A 1AA), amounts, and the 4-year limit. Fix anything it flags, usually by correcting the donor's declaration, before submitting.</p>
            <p>Each claim can be downloaded as a CSV, an XML file or a printable summary for your records.</p>
          </Section>

          <Section value="submit" title="6. Submitting to HMRC">
            <p>There are two ways to submit a claim:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>File it yourself:</strong> on the Donations tab, <strong>Download CSV for HMRC</strong> produces the gifts in the layout HMRC's Charities Online spreadsheet expects. Copy it into HMRC's spreadsheet and upload it at gov.uk (Charities Online).</li>
              <li><strong>Submit from the app:</strong> on the claim, <strong>Submit to HMRC</strong> sends it directly using your Charities Online Government Gateway login.</li>
            </ul>
            <p>The submit dialog has an <strong>Environment</strong> choice. <strong>Test</strong> (the default) goes to HMRC's test service and changes nothing: use it to check a claim. <strong>Live</strong> is a real claim. Only choose Live for real donations, and never for test or sample data.</p>
          </Section>

          <Section value="after" title="7. After you submit">
            <p>HMRC acknowledges the claim, then checks it. The claim's status moves to accepted or rejected (use <strong>Check status</strong>), and HMRC pays the Gift Aid into the charity's bank account, usually within a few weeks. Claimed gifts are marked so they can't go into another claim.</p>
            <p>Keep the claim downloads and your declarations: HMRC can audit claims, and you need records for at least 6 years.</p>
          </Section>
        </Accordion>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" style={{ color: themeColor }} /> Gift Aid FAQ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          <Section value="what" title="What is Gift Aid?">
            <p>A UK scheme that lets charities and churches claim back the basic-rate tax a donor has already paid. For every £1 a UK taxpayer gives, you can claim 25p from HMRC, so £100 becomes £125, at no cost to the donor.</p>
          </Section>
          <Section value="who" title="Who can make a declaration?">
            <p>Anyone who pays UK Income Tax or Capital Gains Tax at least equal to the Gift Aid claimed on all their donations to all charities in that tax year. If they pay less, they're responsible for the difference, which is why the declaration wording says so. Non-taxpayers (including many pensioners and students) shouldn't declare.</p>
          </Section>
          <Section value="cover" title="What does one declaration cover?">
            <p>The declaration in Rekindle covers the donor's gift on the day, gifts in the 4 years before, and all future gifts to this ministry, until they withdraw it. They don't need to declare again each time.</p>
          </Section>
          <Section value="signature" title="Does the donor need to sign?">
            <p>No. HMRC accepts electronic and online declarations without a signature, as long as they contain the donor's full name, home address (house number or name and postcode), the charity's name, the HMRC wording, and you keep a record. Rekindle stores all of that automatically. For paper forms, keep the signed paper.</p>
          </Section>
          <Section value="notclaim" title="What can't you claim Gift Aid on?">
            <ul className="list-disc space-y-1 pl-5">
              <li>Payments for things: tickets, meals, goods, trips, or fees that buy membership rights.</li>
              <li>Raffle and lottery tickets, and auction purchases.</li>
              <li>Gifts from companies (they claim tax relief differently), and money collected on behalf of other people.</li>
              <li>Gifts where the donor gets more than a small benefit in return.</li>
              <li>Anonymous gifts, and gifts more than 4 years old.</li>
            </ul>
            <p>If one of these slipped in, use <strong>Exclude</strong> on the Donations tab.</p>
          </Section>
          <Section value="small" title="What about small cash gifts in the collection plate?">
            <p>Loose cash with no named donor can't be claimed under ordinary Gift Aid. HMRC's separate Gift Aid Small Donations Scheme (GASDS) covers small cash gifts without declarations. Rekindle doesn't run GASDS claims; make those directly with HMRC.</p>
          </Section>
          <Section value="changes" title="A donor moved house, changed name or stopped paying tax">
            <p>Moved or changed name: on the Declarations tab, <strong>correct</strong> their declaration. The old one is kept as evidence and the new one is used from then on. Stopped paying enough tax, or asked to stop: <strong>withdraw</strong> it, and their later gifts won't be claimed.</p>
          </Section>
          <Section value="deadline" title="How long do we have to claim?">
            <p>Claims must be made within 4 years of the end of the accounting period the gift was made in. Most churches claim monthly or quarterly, so money comes in regularly and nothing ages out.</p>
          </Section>
          <Section value="errors" title="Why was a gift or claim flagged?">
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Postcode not valid:</strong> HMRC needs a full UK postcode with the space, e.g. SW1A 1AA. Correct the declaration.</li>
              <li><strong>House number or name missing:</strong> required by HMRC. Correct the declaration.</li>
              <li><strong>No active declaration:</strong> the donor hasn't declared, or used another email. Send them the link.</li>
              <li><strong>Charity details incomplete:</strong> finish Settings &gt; Finance &amp; Billing &gt; Gift Aid.</li>
            </ul>
          </Section>
          <Section value="records" title="What records should we keep?">
            <p>Declarations (Rekindle keeps these permanently), records of each gift, and copies of each claim (download them from the Claims tab). HMRC can ask to see them, so keep them for at least 6 years.</p>
          </Section>
        </Accordion>
        <p className="mt-3 text-xs text-gray-500">This is general guidance. For anything specific to your charity, see gov.uk (search "Gift Aid charities") or contact HMRC Charities.</p>
      </CardContent>
    </Card>
  </div>
);

export default GiftAidHelp;
