import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Crown, Loader2, Edit, RefreshCw } from 'lucide-react';

// Admin-configurable Ministry Partner pricing catalog. Everything the public
// subscribe flow (packages/ministry/src/components/BillingSettings.tsx) and the
// checkout edge function (supabase/ministry-checkout) read comes from this table
// — changing a price or payment link here needs no code change or deploy.

interface PartnerPlan {
  id: string;
  slug: string;
  name: string;
  min_members: number;
  max_members: number | null;
  ngn_price_monthly: number;
  ngn_price_annual: number;
  usd_price_monthly: number;
  usd_price_annual: number;
  paystack_plan_code: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  paypal_billing_link_monthly: string | null;
  paypal_billing_link_annual: string | null;
  features: string[];
  is_active: boolean;
  display_order: number;
}

const EMPTY_FORM: Partial<PartnerPlan> = {
  slug: '', name: '', min_members: 0, max_members: null,
  ngn_price_monthly: 0, ngn_price_annual: 0, usd_price_monthly: 0, usd_price_annual: 0,
  paystack_plan_code: '', stripe_price_id_monthly: '', stripe_price_id_annual: '',
  paypal_billing_link_monthly: '', paypal_billing_link_annual: '',
  features: [], is_active: true, display_order: 0,
};

export const MinistryPartnerPlansManager: React.FC = () => {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<PartnerPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selected, setSelected] = useState<PartnerPlan | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<Partial<PartnerPlan>>(EMPTY_FORM);
  const [featuresText, setFeaturesText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ministry_partner_plans').select('*').order('display_order', { ascending: true });
      if (error) throw error;
      setPlans((data ?? []) as PartnerPlan[]);
    } catch (err) {
      console.error('Error loading partner plans:', err);
      toast({ title: t('partnerPlansManager', 'error', 'Error'), description: t('partnerPlansManager', 'failedToLoad', 'Failed to load plans'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openEdit = (plan: PartnerPlan) => {
    setSelected(plan);
    setIsNew(false);
    setForm(plan);
    setFeaturesText(plan.features.join('\n'));
    setShowEditModal(true);
  };

  const openCreate = () => {
    setSelected(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setFeaturesText('');
    setShowEditModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        features: featuresText.split('\n').map((f) => f.trim()).filter(Boolean),
      };
      if (isNew) {
        const { error } = await supabase.from('ministry_partner_plans').insert(payload);
        if (error) throw error;
      } else if (selected) {
        const { error } = await supabase.from('ministry_partner_plans').update(payload).eq('id', selected.id);
        if (error) throw error;
      }
      toast({ title: t('partnerPlansManager', 'success', 'Success'), description: t('partnerPlansManager', 'planSaved', 'Plan saved') });
      setShowEditModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('partnerPlansManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan: PartnerPlan) => {
    try {
      const { error } = await supabase
        .from('ministry_partner_plans').update({ is_active: !plan.is_active }).eq('id', plan.id);
      if (error) throw error;
      loadData();
    } catch (err: any) {
      toast({ title: t('partnerPlansManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            {t('partnerPlansManager', 'title', 'Ministry Partner Plans')}
            <Button variant="outline" size="sm" className="ml-auto" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('partnerPlansManager', 'refresh', 'Refresh')}
            </Button>
            <Button size="sm" onClick={openCreate}>
              {t('partnerPlansManager', 'newPlan', 'New Plan')}
            </Button>
          </CardTitle>
          <p className="text-sm text-gray-500">
            {t('partnerPlansManager', 'subtitle', 'Pricing and payment provider IDs shown on the landing page and Ministry Partner subscribe flow. Nigeria charges NGN via Paystack; everywhere else charges USD via Stripe or PayPal.')}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('partnerPlansManager', 'plan', 'Plan')}</th>
                  <th className="text-left p-4 font-medium">{t('partnerPlansManager', 'members', 'Members')}</th>
                  <th className="text-left p-4 font-medium">{t('partnerPlansManager', 'monthly', 'Monthly')}</th>
                  <th className="text-left p-4 font-medium">{t('partnerPlansManager', 'annual', 'Annual')}</th>
                  <th className="text-left p-4 font-medium">{t('partnerPlansManager', 'providers', 'Providers configured')}</th>
                  <th className="text-left p-4 font-medium">{t('partnerPlansManager', 'active', 'Active')}</th>
                  <th className="text-left p-4 font-medium">{t('partnerPlansManager', 'actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-gray-400">{plan.slug}</div>
                    </td>
                    <td className="p-4 text-sm">
                      {plan.max_members ? `${plan.min_members}–${plan.max_members}` : `${plan.min_members}+`}
                    </td>
                    <td className="p-4 text-sm">
                      <div>₦{plan.ngn_price_monthly.toLocaleString()}</div>
                      <div className="text-gray-400">${plan.usd_price_monthly.toLocaleString()}</div>
                    </td>
                    <td className="p-4 text-sm">
                      <div>₦{plan.ngn_price_annual.toLocaleString()}</div>
                      <div className="text-gray-400">${plan.usd_price_annual.toLocaleString()}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        {plan.paystack_plan_code && <Badge variant="outline" className="text-xs">Paystack</Badge>}
                        {(plan.stripe_price_id_monthly || plan.stripe_price_id_annual) && <Badge variant="outline" className="text-xs">Stripe</Badge>}
                        {(plan.paypal_billing_link_monthly || plan.paypal_billing_link_annual) && <Badge variant="outline" className="text-xs">PayPal</Badge>}
                      </div>
                    </td>
                    <td className="p-4">
                      <Switch checked={plan.is_active} onCheckedChange={() => toggleActive(plan)} />
                    </td>
                    <td className="p-4">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? t('partnerPlansManager', 'newPlan', 'New Plan') : t('partnerPlansManager', 'editPlan', 'Edit Plan')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('partnerPlansManager', 'slug', 'Slug (unique, e.g. tier_1)')}</Label>
                <Input value={form.slug ?? ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={!isNew} />
              </div>
              <div>
                <Label>{t('partnerPlansManager', 'name', 'Display Name')}</Label>
                <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>{t('partnerPlansManager', 'minMembers', 'Min Members')}</Label>
                <Input type="number" value={form.min_members ?? 0} onChange={(e) => setForm({ ...form, min_members: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>{t('partnerPlansManager', 'maxMembers', 'Max Members (blank = unbounded)')}</Label>
                <Input
                  type="number"
                  value={form.max_members ?? ''}
                  onChange={(e) => setForm({ ...form, max_members: e.target.value === '' ? null : parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <Label>{t('partnerPlansManager', 'ngnMonthly', 'NGN / month')}</Label>
                <Input type="number" value={form.ngn_price_monthly ?? 0} onChange={(e) => setForm({ ...form, ngn_price_monthly: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>{t('partnerPlansManager', 'ngnAnnual', 'NGN / year')}</Label>
                <Input type="number" value={form.ngn_price_annual ?? 0} onChange={(e) => setForm({ ...form, ngn_price_annual: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>{t('partnerPlansManager', 'usdMonthly', 'USD / month')}</Label>
                <Input type="number" value={form.usd_price_monthly ?? 0} onChange={(e) => setForm({ ...form, usd_price_monthly: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>{t('partnerPlansManager', 'usdAnnual', 'USD / year')}</Label>
                <Input type="number" value={form.usd_price_annual ?? 0} onChange={(e) => setForm({ ...form, usd_price_annual: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>{t('partnerPlansManager', 'paystackCode', 'Paystack Plan Code')}</Label>
                <Input
                  placeholder="PLN_xxxxxxxx"
                  value={form.paystack_plan_code ?? ''}
                  onChange={(e) => setForm({ ...form, paystack_plan_code: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('partnerPlansManager', 'stripeMonthly', 'Stripe Price ID (monthly)')}</Label>
                  <Input
                    placeholder="price_xxxxxxxx"
                    value={form.stripe_price_id_monthly ?? ''}
                    onChange={(e) => setForm({ ...form, stripe_price_id_monthly: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('partnerPlansManager', 'stripeAnnual', 'Stripe Price ID (annual)')}</Label>
                  <Input
                    placeholder="price_xxxxxxxx"
                    value={form.stripe_price_id_annual ?? ''}
                    onChange={(e) => setForm({ ...form, stripe_price_id_annual: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('partnerPlansManager', 'paypalMonthly', 'PayPal Billing Link (monthly)')}</Label>
                  <Input
                    placeholder="https://paypal.com/..."
                    value={form.paypal_billing_link_monthly ?? ''}
                    onChange={(e) => setForm({ ...form, paypal_billing_link_monthly: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('partnerPlansManager', 'paypalAnnual', 'PayPal Billing Link (annual)')}</Label>
                  <Input
                    placeholder="https://paypal.com/..."
                    value={form.paypal_billing_link_annual ?? ''}
                    onChange={(e) => setForm({ ...form, paypal_billing_link_annual: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>{t('partnerPlansManager', 'features', 'Features (one per line)')}</Label>
              <Textarea rows={5} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="flex items-center justify-between">
                <Label>{t('partnerPlansManager', 'active', 'Active')}</Label>
                <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
              <div>
                <Label>{t('partnerPlansManager', 'displayOrder', 'Display Order')}</Label>
                <Input type="number" value={form.display_order ?? 0} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>{t('partnerPlansManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !form.slug || !form.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('partnerPlansManager', 'saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryPartnerPlansManager;
