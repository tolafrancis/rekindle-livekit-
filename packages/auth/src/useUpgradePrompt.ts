/**
 * useUpgradePrompt — unified upgrade prompt state and dismissal tracking.
 *
 * Rules:
 *  - Same prompt type: max once per 48 hours
 *  - After 3 dismissals of same type: suppress for 30 days
 *  - Never show more than 1 prompt per session
 */

import { useState, useCallback } from 'react';

export type UpgradePromptType =
  // Ministry
  | 'live_channel_create'
  | 'ministry_member_limit'
  | 'ministry_inbox_gate'
  | 'ministry_analytics_export'
  | 'ministry_broadcast_schedule'
  | 'ministry_enterprise_members'
  | 'ministry_whitelabel';

export interface UpgradePromptConfig {
  type: UpgradePromptType;
  title: string;
  body: string;
  /** What the user gains with the upgrade */
  benefit: string;
  /** Which plan tier to nudge towards */
  targetPlan: 'partner' | 'premium_plus' | 'ministry_starter' | 'ministry_growth' | 'ministry_enterprise';
  targetPlanLabel: string;
  targetPlanPrice: string;
  /** Show a 7-day trial CTA (only for high-value gates) */
  showTrial?: boolean;
  /** Optional override for the CTA label */
  ctaLabel?: string;
  /** Category determines which tab to open */
  category: 'individual' | 'ministry';
}

// Dismissal tracking stored per prompt type
const STORAGE_KEY = 'rk_upgrade_prompts';

function getPromptHistory(): Record<string, { count: number; lastShown: number; lastDismissed: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePromptHistory(history: Record<string, { count: number; lastShown: number; lastDismissed: number }>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

function canShowPrompt(type: UpgradePromptType): boolean {
  const history = getPromptHistory();
  const record = history[type];
  if (!record) return true;

  const now = Date.now();
  const hoursSinceShown = (now - record.lastShown) / 3600000;

  // After 3 dismissals, suppress for 30 days
  if (record.count >= 3 && hoursSinceShown < 720) return false;
  // Otherwise: max once per 48 hours
  if (hoursSinceShown < 48) return false;

  return true;
}

function recordShown(type: UpgradePromptType) {
  const history = getPromptHistory();
  const existing = history[type] ?? { count: 0, lastShown: 0, lastDismissed: 0 };
  history[type] = { ...existing, lastShown: Date.now() };
  savePromptHistory(history);
}

function recordDismissed(type: UpgradePromptType) {
  const history = getPromptHistory();
  const existing = history[type] ?? { count: 0, lastShown: 0, lastDismissed: 0 };
  history[type] = { ...existing, count: existing.count + 1, lastDismissed: Date.now() };
  savePromptHistory(history);
}

// Pre-configured prompts
export const UPGRADE_PROMPTS: Record<UpgradePromptType, UpgradePromptConfig> = {
  live_channel_create: {
    type: 'live_channel_create',
    title: 'Create your own Live Channel',
    body: 'Hosting live channels is a Ministry Partner feature. You can still join and watch any channel for free.',
    benefit: 'Create and host live channels as a Ministry Partner.',
    targetPlan: 'ministry_starter',
    targetPlanLabel: '⛪ Ministry Partner',
    targetPlanPrice: 'Ministry partnership',
    ctaLabel: 'Become a Ministry Partner',
    category: 'ministry',
  },
  // Ministry prompts
  ministry_member_limit: {
    type: 'ministry_member_limit',
    title: 'Your ministry is growing 📈',
    body: "You're approaching your member limit. Upgrade before new members can't join.",
    benefit: 'Growth plan supports up to 1,000 members.',
    targetPlan: 'ministry_growth',
    targetPlanLabel: '🚀 Growth',
    targetPlanPrice: '$149/mo',
    ctaLabel: 'Upgrade Ministry Plan',
    category: 'ministry',
  },
  ministry_inbox_gate: {
    type: 'ministry_inbox_gate',
    title: 'Reach people where they already are',
    body: 'The Multi-Channel Evangelism Inbox connects Messenger, Instagram and your website chat. WhatsApp is available on all plans.',
    benefit: 'All 4 evangelism channels on Growth and above.',
    targetPlan: 'ministry_growth',
    targetPlanLabel: '🚀 Growth',
    targetPlanPrice: '$149/mo',
    showTrial: false,
    ctaLabel: 'Upgrade to Unlock Inbox',
    category: 'ministry',
  },
  ministry_analytics_export: {
    type: 'ministry_analytics_export',
    title: 'Export your analytics',
    body: 'Download and share reports with your team. All your data, in your hands.',
    benefit: 'CSV export on Growth and above.',
    targetPlan: 'ministry_growth',
    targetPlanLabel: '🚀 Growth',
    targetPlanPrice: '$149/mo',
    ctaLabel: 'Upgrade to Export',
    category: 'ministry',
  },
  ministry_broadcast_schedule: {
    type: 'ministry_broadcast_schedule',
    title: 'Schedule your broadcasts',
    body: 'Send broadcasts at the right time, every time — automatically.',
    benefit: 'Scheduled broadcasts on Growth and above.',
    targetPlan: 'ministry_growth',
    targetPlanLabel: '🚀 Growth',
    targetPlanPrice: '$149/mo',
    category: 'ministry',
  },
  ministry_enterprise_members: {
    type: 'ministry_enterprise_members',
    title: "You're at 80% of your member limit",
    body: 'Enterprise gives you unlimited members, API access, and a dedicated onboarding specialist.',
    benefit: 'Unlimited members + full Enterprise features.',
    targetPlan: 'ministry_enterprise',
    targetPlanLabel: '🏛 Enterprise',
    targetPlanPrice: '$299/mo',
    ctaLabel: 'Talk to Us',
    category: 'ministry',
  },
  ministry_whitelabel: {
    type: 'ministry_whitelabel',
    title: 'Make this your church\'s app',
    body: 'Custom domain, your logo, your colours — built for your congregation.',
    benefit: 'White-Label add-on on Enterprise. One-time setup.',
    targetPlan: 'ministry_enterprise',
    targetPlanLabel: '🏛 Enterprise',
    targetPlanPrice: '$299/mo',
    ctaLabel: 'Request a Demo',
    category: 'ministry',
  },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useUpgradePrompt() {
  const [activePrompt, setActivePrompt] = useState<UpgradePromptConfig | null>(null);

  const show = useCallback((type: UpgradePromptType, force = false) => {
    if (!force && !canShowPrompt(type)) return;
    recordShown(type);
    setActivePrompt(UPGRADE_PROMPTS[type]);
  }, []);

  const dismiss = useCallback(() => {
    if (activePrompt) recordDismissed(activePrompt.type);
    setActivePrompt(null);
  }, [activePrompt]);

  return { activePrompt, show, dismiss };
}
