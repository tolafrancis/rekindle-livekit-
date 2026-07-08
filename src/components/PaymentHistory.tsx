import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Receipt, 
  Download, 
  CreditCard, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Crown,
  Heart,
  Loader2,
  FileText
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface PaymentReceipt {
  id: string;
  payment_provider: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  subscription_tier: string;
  receipt_url: string | null;
  metadata: any;
  created_at: string;
}

interface Subscription {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  subscription_tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface PaymentHistoryProps {
  onNavigateToSubscription?: () => void;
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({ onNavigateToSubscription }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadPaymentData();
    }
  }, [user?.id]);

  const loadPaymentData = async () => {
    setLoading(true);
    try {
      // Load payment receipts
      const { data: receiptsData, error: receiptsError } = await supabase
        .from('payment_receipts')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (!receiptsError && receiptsData) {
        setReceipts(receiptsData);
      }

      // Load subscription
      const { data: subData, error: subError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (!subError && subData) {
        setSubscription(subData);
      }
    } catch (error) {
      console.error('Error loading payment data:', error);
    }
    setLoading(false);
  };

  const openStripePortal = async () => {
    if (!subscription?.stripe_customer_id) {
      toast({
        title: t('paymentHistory', 'noStripeAccount', 'No Stripe Account'),
        description: t('paymentHistory', 'noStripeSubscriptionDesc', 'You don\'t have a Stripe subscription to manage.'),
        variant: 'destructive'
      });
      return;
    }

    setActionLoading('stripe-portal');
    try {
      const { data, error } = await supabase.functions.invoke('stripe-portal', {
        body: {
          customerId: subscription.stripe_customer_id,
          returnUrl: window.location.href
        }
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: any) {
      toast({
        title: t('paymentHistory', 'error', 'Error'),
        description: error.message || t('paymentHistory', 'failedOpenPortal', 'Failed to open billing portal'),
        variant: 'destructive'
      });
    }
    setActionLoading(null);
  };

  const cancelPaystackSubscription = async () => {
    if (!subscription?.paystack_subscription_code) {
      toast({
        title: t('paymentHistory', 'noPaystackSubscription', 'No Paystack Subscription'),
        description: t('paymentHistory', 'noPaystackSubscriptionDesc', 'You don\'t have a Paystack subscription to cancel.'),
        variant: 'destructive'
      });
      return;
    }

    if (!confirm(t('paymentHistory', 'confirmCancelSubscription', 'Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.'))) {
      return;
    }

    setActionLoading('paystack-cancel');
    try {
      const { data, error } = await supabase.functions.invoke('paystack-manage', {
        body: {
          action: 'cancel_subscription',
          subscriptionCode: subscription.paystack_subscription_code
        }
      });

      if (error) throw error;
      
      toast({
        title: t('paymentHistory', 'subscriptionCancelled', 'Subscription Cancelled'),
        description: t('paymentHistory', 'subscriptionCancelledDesc', 'Your subscription will end at the current billing period.')
      });
      
      loadPaymentData();
    } catch (error: any) {
      toast({
        title: t('paymentHistory', 'error', 'Error'),
        description: error.message || t('paymentHistory', 'failedCancelSubscription', 'Failed to cancel subscription'),
        variant: 'destructive'
      });
    }
    setActionLoading(null);
  };

  const handleUpgradeToPremium = () => {
    // Call the callback to switch to subscription tab
    if (onNavigateToSubscription) {
      onNavigateToSubscription();
    }
  };

  const generatePDFReceipt = (receipt: PaymentReceipt) => {
    // Create a simple PDF-like receipt
    const receiptContent = `
PAYMENT RECEIPT
================

ReKindled - Spiritual Growth Platform

Receipt ID: ${receipt.id}
Date: ${new Date(receipt.created_at).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}

Payment Details:
----------------
Amount: ${receipt.currency} ${receipt.amount.toFixed(2)}
Provider: ${receipt.payment_provider.toUpperCase()}
Transaction ID: ${receipt.payment_id}
Status: ${receipt.status.toUpperCase()}
Plan: ${receipt.subscription_tier || 'Premium'}

Thank you for your support!

For questions, contact support@rekindle.app
    `.trim();

    // Create blob and download
    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekindle-receipt-${receipt.id.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: t('paymentHistory', 'receiptDownloaded', 'Receipt Downloaded'),
      description: t('paymentHistory', 'receiptDownloadedDesc', 'Your receipt has been downloaded.')
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'active':
      case 'success':
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" /> {status}</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700"><Clock className="h-3 w-3 mr-1" /> {status}</Badge>;
      case 'failed':
      case 'canceled':
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" /> {status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('paymentHistory', 'notAvailable', 'N/A');
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
      {/* Giving & Partnership */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Heart className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <CardTitle>{t('paymentHistory', 'givingPartnership', 'Giving & Partnership')}</CardTitle>
                <CardDescription>{t('paymentHistory', 'givingSustainsMission', 'ReKindle is free — your giving sustains the mission')}</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadPaymentData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('paymentHistory', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('paymentHistory', 'partnerLevel', 'Partner level')}</p>
                  <p className="font-semibold capitalize">{subscription.subscription_tier}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('paymentHistory', 'status', 'Status')}</p>
                  {getStatusBadge(subscription.status)}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('paymentHistory', 'partnerSince', 'Partner since')}</p>
                  <p className="font-medium">{formatDate(subscription.current_period_start)}</p>
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm text-purple-800">
                {t('paymentHistory', 'thankYouPartnering', 'Thank you for partnering with ReKindle. Your giving keeps the platform free and the mission moving forward.')}
              </div>
              <div className="flex gap-3 pt-1">
                <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleUpgradeToPremium}>
                  <Heart className="h-4 w-4 mr-2" />
                  {t('paymentHistory', 'manageGiving', 'Manage giving')}
                </Button>
                {subscription.stripe_customer_id && (
                  <Button
                    variant="outline"
                    onClick={openStripePortal}
                    disabled={actionLoading === 'stripe-portal'}
                  >
                    {actionLoading === 'stripe-portal' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    {t('paymentHistory', 'paymentMethods', 'Payment methods')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Heart className="h-10 w-10 mx-auto text-purple-300 mb-3" />
              <p className="text-gray-700 font-medium mb-1">{t('paymentHistory', 'freeForEveryone', 'ReKindle is free for everyone.')}</p>
              <p className="text-gray-500 mb-4 text-sm">
                {t('paymentHistory', 'becomePartnerSupport', 'Become a partner to support the mission and help us reach more people.')}
              </p>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                onClick={handleUpgradeToPremium}
              >
                <Heart className="h-4 w-4 mr-2" />
                {t('paymentHistory', 'becomeAPartner', 'Become a Partner')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Receipt className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <CardTitle>{t('paymentHistory', 'paymentHistoryTitle', 'Payment History')}</CardTitle>
              <CardDescription>{t('paymentHistory', 'viewDownloadReceipts', 'View and download your past receipts')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">{t('paymentHistory', 'noPaymentHistory', 'No payment history yet.')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {receipts.map((receipt) => (
                <div 
                  key={receipt.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${
                      receipt.payment_provider === 'stripe' 
                        ? 'bg-purple-100' 
                        : 'bg-green-100'
                    }`}>
                      <CreditCard className={`h-5 w-5 ${
                        receipt.payment_provider === 'stripe' 
                          ? 'text-purple-600' 
                          : 'text-green-600'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {receipt.currency} {receipt.amount.toFixed(2)}
                        </p>
                        {getStatusBadge(receipt.status)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="h-3 w-3" />
                        {new Date(receipt.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                        <span className="text-gray-300">|</span>
                        <span className="capitalize">{receipt.payment_provider}</span>
                        {receipt.subscription_tier && (
                          <>
                            <span className="text-gray-300">|</span>
                            <span className="capitalize">{t('paymentHistory', 'tierPlan', '{tier} Plan').replace('{tier}', String(receipt.subscription_tier))}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {receipt.receipt_url && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => window.open(receipt.receipt_url!, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generatePDFReceipt(receipt)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t('paymentHistory', 'receipt', 'Receipt')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Methods Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CreditCard className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <CardTitle>{t('paymentHistory', 'paymentMethodsTitle', 'Payment Methods')}</CardTitle>
              <CardDescription>{t('paymentHistory', 'manageSavedMethods', 'Manage your saved payment methods')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {subscription?.stripe_customer_id ? (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-8 bg-gradient-to-r from-purple-600 to-purple-400 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">CARD</span>
                  </div>
                  <div>
                    <p className="font-medium">{t('paymentHistory', 'stripePaymentMethod', 'Stripe Payment Method')}</p>
                    <p className="text-sm text-gray-500">{t('paymentHistory', 'manageViaStripePortal', 'Manage via Stripe portal')}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={openStripePortal}>
                  {t('paymentHistory', 'update', 'Update')}
                </Button>
              </div>
            ) : subscription?.paystack_customer_code ? (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-8 bg-gradient-to-r from-green-600 to-green-400 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">CARD</span>
                  </div>
                  <div>
                    <p className="font-medium">{t('paymentHistory', 'paystackPaymentMethod', 'Paystack Payment Method')}</p>
                    <p className="text-sm text-gray-500">{t('paymentHistory', 'cardOnFile', 'Card on file')}</p>
                  </div>
                </div>
                <Badge variant="outline">{t('paymentHistory', 'active', 'Active')}</Badge>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <CreditCard className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <p>{t('paymentHistory', 'noMethodsSaved', 'No payment methods saved.')}</p>
                <p className="text-sm">{t('paymentHistory', 'addMethodOnSubscribe', 'Add a payment method when you subscribe to a plan.')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};