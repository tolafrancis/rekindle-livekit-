import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import {
  Wallet, Plus, ArrowDownLeft, ArrowUpRight, RefreshCw,
  MessageSquare, Clock, CheckCircle2, XCircle, Info,
  Loader2, CreditCard, Zap, AlertTriangle,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

export const WHATSAPP_COST_PER_MESSAGE = 0.03; // USD

const TOP_UP_PACKAGES = [
  { credits: 100,  usd: 3.00,  label: '100 messages',  popular: false },
  { credits: 500,  usd: 15.00, label: '500 messages',  popular: false },
  { credits: 1000, usd: 30.00, label: '1,000 messages', popular: true  },
  { credits: 3000, usd: 90.00, label: '3,000 messages', popular: false },
  { credits: 5000, usd: 150.00, label: '5,000 messages', popular: false },
  { credits: 10000, usd: 300.00, label: '10,000 messages', popular: false },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  id: string;
  user_id: string;
  balance_credits: number;   // number of messages remaining
  total_purchased: number;
  total_used: number;
  updated_at: string;
}

interface WalletTransaction {
  id: string;
  user_id: string;
  type: 'topup' | 'deduction' | 'refund' | 'bonus';
  credits: number;           // positive = added, negative = spent
  usd_amount?: number;
  description: string;
  broadcast_id?: string;
  recipients_count?: number;
  created_at: string;
  status: 'completed' | 'pending' | 'failed';
}

interface BroadcastWalletProps {
  /** If provided, also shows cost estimate for a pending broadcast */
  pendingRecipientCount?: number;
  onBalanceChange?: (newBalance: number) => void;
  compact?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function creditsToUsd(credits: number): string {
  return `$${(credits * WHATSAPP_COST_PER_MESSAGE).toFixed(2)}`;
}

function formatDate(ts: string): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Compact balance chip (used inline in BroadcastMessaging) ─────────────────

export function WalletBalanceChip({
  balance,
  loading,
  onClick,
}: { balance: number; loading: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  const low = balance < 50;
  const empty = balance === 0;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
        empty
          ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
          : low
          ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
      }`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : empty ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : (
        <Wallet className="h-3.5 w-3.5" />
      )}
      {loading ? t('broadcastWallet', 'loading', 'Loading…') : empty ? t('broadcastWallet', 'noCredits', 'No credits') : `${balance.toLocaleString()} ${t('broadcastWallet', 'credits', 'credits')}`}
      <Plus className="h-3 w-3 opacity-60" />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const BroadcastWallet: React.FC<BroadcastWalletProps> = ({
  pendingRecipientCount,
  onBalanceChange,
  compact = false,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topping, setTopping] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<typeof TOP_UP_PACKAGES[0] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ── Fetch wallet balance ──────────────────────────────────────────────────
  const fetchWallet = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('broadcast_wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Row doesn't exist yet — create it
        const { data: created } = await supabase
          .from('broadcast_wallets')
          .insert({ user_id: user.id, balance_credits: 0, total_purchased: 0, total_used: 0 })
          .select()
          .single();
        setWallet(created);
        onBalanceChange?.(0);
      } else if (!error && data) {
        setWallet(data);
        onBalanceChange?.(data.balance_credits);
      }
    } catch (err) {
      console.error('Wallet fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, onBalanceChange]);

  // ── Fetch transaction history ─────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setTxLoading(true);
    try {
      const { data } = await supabase
        .from('broadcast_wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setTransactions(data ?? []);
    } catch (err) {
      console.error('Transaction fetch error:', err);
    } finally {
      setTxLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  useEffect(() => {
    if (showHistory) fetchTransactions();
  }, [showHistory, fetchTransactions]);

  // ── Initiate Stripe top-up ────────────────────────────────────────────────
  const handleTopUp = async () => {
    if (!selectedPackage || !user) return;
    setTopping(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-wallet-topup', {
        body: {
          userId:       user.id,
          credits:      selectedPackage.credits,
          usdAmount:    selectedPackage.usd,
          packageLabel: selectedPackage.label,
          successUrl:   `${window.location.origin}${window.location.pathname}?wallet_topup=success&credits=${selectedPackage.credits}`,
          cancelUrl:    `${window.location.origin}${window.location.pathname}?wallet_topup=cancelled`,
        },
      });

      if (error || !data?.checkoutUrl) {
        throw new Error(error?.message ?? 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      toast({ title: t('broadcastWallet', 'topUpFailed', 'Top-up failed'), description: err.message, variant: 'destructive' });
      setTopping(false);
    }
  };

  // ── Handle return from Stripe ─────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wallet_topup') === 'success') {
      const credits = parseInt(params.get('credits') ?? '0', 10);
      toast({
        title: t('broadcastWallet', 'topUpSuccessful', '✅ Top-up successful!'),
        description: t('broadcastWallet', 'creditsAdded', '{credits} WhatsApp credits have been added to your wallet.').replace('{credits}', String(credits.toLocaleString())),
      });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      fetchWallet();
    } else if (params.get('wallet_topup') === 'cancelled') {
      toast({ title: t('broadcastWallet', 'topUpCancelled', 'Top-up cancelled'), description: t('broadcastWallet', 'noChargeMade', 'No charge was made.') });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchWallet]);

  const balance = wallet?.balance_credits ?? 0;
  const pendingCost = pendingRecipientCount ? pendingRecipientCount * WHATSAPP_COST_PER_MESSAGE : 0;
  const canAfford = pendingRecipientCount === undefined || balance >= (pendingRecipientCount ?? 0);

  // ── Compact mode — just the chip + top-up dialog ──────────────────────────
  if (compact) {
    return (
      <>
        <WalletBalanceChip
          balance={balance}
          loading={loading}
          onClick={() => setShowTopUp(true)}
        />
        <TopUpDialog
          open={showTopUp}
          onOpenChange={setShowTopUp}
          balance={balance}
          packages={TOP_UP_PACKAGES}
          selectedPackage={selectedPackage}
          onSelectPackage={setSelectedPackage}
          onTopUp={handleTopUp}
          topping={topping}
        />
      </>
    );
  }

  // ── Full wallet panel ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Balance card */}
      <Card className="border-green-100 bg-gradient-to-br from-green-50 to-emerald-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-base">{t('broadcastWallet', 'walletTitle', 'WhatsApp Broadcast Wallet')}</CardTitle>
                <CardDescription className="text-xs">
                  {WHATSAPP_COST_PER_MESSAGE * 100}{t('broadcastWallet', 'perMessageSendOnly', '¢ per message · send-only broadcasts')}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchWallet}
              disabled={loading}
              className="gap-1.5 h-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('broadcastWallet', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Balance display */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('broadcastWallet', 'availableCredits', 'Available credits')}</p>
              {loading ? (
                <div className="h-9 w-32 bg-green-100 rounded animate-pulse" />
              ) : (
                <p className="text-4xl font-bold text-green-700 tabular-nums">
                  {balance.toLocaleString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {loading ? '…' : creditsToUsd(balance)} {t('broadcastWallet', 'remaining', 'remaining')}
              </p>
            </div>
            <div className="text-right space-y-1">
              {wallet && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t('broadcastWallet', 'totalPurchased', 'Total purchased:')} <span className="font-medium">{wallet.total_purchased.toLocaleString()}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('broadcastWallet', 'totalUsed', 'Total used:')} <span className="font-medium">{wallet.total_used.toLocaleString()}</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Low balance warning */}
          {!loading && balance < 100 && balance > 0 && (
            <Alert className="border-amber-200 bg-amber-50 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 text-xs">
                {t('broadcastWallet', 'runningLow', 'Running low — top up to keep sending WhatsApp broadcasts.')}
              </AlertDescription>
            </Alert>
          )}
          {!loading && balance === 0 && (
            <Alert className="border-red-200 bg-red-50 py-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700 text-xs">
                {t('broadcastWallet', 'noCreditsRemaining', 'No credits remaining. Top up to send WhatsApp broadcasts.')}
              </AlertDescription>
            </Alert>
          )}

          {/* Pending broadcast cost estimate */}
          {pendingRecipientCount !== undefined && pendingRecipientCount > 0 && (
            <div className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
              canAfford
                ? 'bg-white border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                <MessageSquare className={`h-4 w-4 ${canAfford ? 'text-green-600' : 'text-red-500'}`} />
                <span className="text-muted-foreground">
                  {t('broadcastWallet', 'costFor', 'Cost for')} <strong>{pendingRecipientCount.toLocaleString()}</strong> {t('broadcastWallet', 'recipients', 'recipients')}
                </span>
              </div>
              <div className="text-right">
                <p className={`font-semibold ${canAfford ? 'text-green-700' : 'text-red-600'}`}>
                  {pendingRecipientCount} {t('broadcastWallet', 'credits', 'credits')}
                </p>
                <p className="text-xs text-muted-foreground">
                  ${pendingCost.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={() => setShowTopUp(true)}
              className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              {t('broadcastWallet', 'topUpCredits', 'Top Up Credits')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(true)}
              className="gap-1.5"
            >
              <Clock className="h-3.5 w-3.5" />
              {t('broadcastWallet', 'history', 'History')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pricing info */}
      <Card className="border-0 bg-gray-50">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>{t('broadcastWallet', 'howItWorks', 'How it works:')}</strong> {t('broadcastWallet', 'howItWorksBefore', 'Credits are deducted only for')} <em>{t('broadcastWallet', 'successfullyDelivered', 'successfully delivered')}</em> {t('broadcastWallet', 'howItWorksAfter', 'WhatsApp messages. Failed deliveries are not charged.')}</p>
              <p>{t('broadcastWallet', 'creditEquals', '1 credit = 1 WhatsApp message =')} ${WHATSAPP_COST_PER_MESSAGE.toFixed(2)}. {t('broadcastWallet', 'neverExpire', 'Credits never expire.')}</p>
              <p>{t('broadcastWallet', 'sendOnlyNote', 'WhatsApp broadcasts are send-only — recipients cannot reply through this system.')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top-up dialog */}
      <TopUpDialog
        open={showTopUp}
        onOpenChange={setShowTopUp}
        balance={balance}
        packages={TOP_UP_PACKAGES}
        selectedPackage={selectedPackage}
        onSelectPackage={setSelectedPackage}
        onTopUp={handleTopUp}
        topping={topping}
      />

      {/* Transaction history dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-600" />
              {t('broadcastWallet', 'transactionHistory', 'Transaction History')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {txLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {t('broadcastWallet', 'noTransactions', 'No transactions yet.')}
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {transactions.map(tx => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(false)}>{t('broadcastWallet', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Top-up dialog ─────────────────────────────────────────────────────────────

function TopUpDialog({
  open, onOpenChange, balance, packages, selectedPackage, onSelectPackage, onTopUp, topping,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balance: number;
  packages: typeof TOP_UP_PACKAGES;
  selectedPackage: typeof TOP_UP_PACKAGES[0] | null;
  onSelectPackage: (p: typeof TOP_UP_PACKAGES[0]) => void;
  onTopUp: () => void;
  topping: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-green-600" />
            {t('broadcastWallet', 'topUpWhatsappCredits', 'Top Up WhatsApp Credits')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {t('broadcastWallet', 'currentBalance', 'Current balance:')} <strong className="text-foreground">{balance.toLocaleString()} {t('broadcastWallet', 'credits', 'credits')}</strong>
          </p>

          {/* Package grid */}
          <div className="grid grid-cols-2 gap-2">
            {packages.map(pkg => (
              <button
                key={pkg.credits}
                onClick={() => onSelectPackage(pkg)}
                className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                  selectedPackage?.credits === pkg.credits
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                }`}
              >
                {pkg.popular && (
                  <span className="absolute -top-2 left-3 text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full">
                    {t('broadcastWallet', 'popular', 'POPULAR')}
                  </span>
                )}
                <p className="font-bold text-sm text-foreground">
                  {pkg.credits.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{pkg.label}</p>
                <p className="text-base font-semibold text-green-700 mt-1">
                  ${pkg.usd.toFixed(2)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  ${WHATSAPP_COST_PER_MESSAGE.toFixed(2)}{t('broadcastWallet', 'perMsg', '/msg')}
                </p>
              </button>
            ))}
          </div>

          {selectedPackage && (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <span className="text-green-700">
                {t('broadcastWallet', 'adding', 'Adding')} <strong>{selectedPackage.credits.toLocaleString()}</strong> {t('broadcastWallet', 'credits', 'credits')}
              </span>
              <span className="font-bold text-green-700">${selectedPackage.usd.toFixed(2)}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 p-3 rounded-lg">
            <CreditCard className="h-3.5 w-3.5 shrink-0" />
            {t('broadcastWallet', 'securePayment', 'Secure payment via Stripe. Credits are added instantly after payment.')}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={topping}>
            {t('broadcastWallet', 'cancel', 'Cancel')}
          </Button>
          <Button
            onClick={onTopUp}
            disabled={!selectedPackage || topping}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            {topping ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t('broadcastWallet', 'redirecting', 'Redirecting…')}</>
            ) : (
              <><CreditCard className="h-4 w-4" />{t('broadcastWallet', 'pay', 'Pay')} {selectedPackage ? `$${selectedPackage.usd.toFixed(2)}` : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction row ───────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const { t } = useLanguage();
  const isCredit = tx.credits > 0;
  const icon = isCredit
    ? <ArrowDownLeft className="h-4 w-4 text-green-600" />
    : <ArrowUpRight className="h-4 w-4 text-red-500" />;

  const typeLabel: Record<WalletTransaction['type'], string> = {
    topup: t('broadcastWallet', 'txTopup', 'Top-up'),
    deduction: t('broadcastWallet', 'txDeduction', 'WhatsApp Broadcast'),
    refund: t('broadcastWallet', 'txRefund', 'Refund'),
    bonus: t('broadcastWallet', 'txBonus', 'Bonus Credits'),
  };

  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-full ${isCredit ? 'bg-green-100' : 'bg-red-50'}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{typeLabel[tx.type]}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tx.description}</p>
          {tx.recipients_count && (
            <p className="text-xs text-muted-foreground">
              {tx.recipients_count.toLocaleString()} {t('broadcastWallet', 'recipients', 'recipients')}
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
          {isCredit ? '+' : ''}{tx.credits.toLocaleString()}
        </p>
        {tx.usd_amount && (
          <p className="text-xs text-muted-foreground">${Math.abs(tx.usd_amount).toFixed(2)}</p>
        )}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          {tx.status === 'completed'
            ? <CheckCircle2 className="h-3 w-3 text-green-500" />
            : tx.status === 'failed'
            ? <XCircle className="h-3 w-3 text-red-400" />
            : <Clock className="h-3 w-3 text-amber-400" />
          }
          <span className="text-[10px] text-muted-foreground">{formatDate(tx.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
