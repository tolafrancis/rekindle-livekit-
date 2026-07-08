// =============================================================================
// Gift Aid — HMRC submission service (Phase 5)
// Folder: src/lib/giftAid/
// -----------------------------------------------------------------------------
// Thin client wrapper around the `gift-aid-hmrc-submit` edge function. The
// Government Gateway password is passed straight through to the function and is
// never stored client-side.
// =============================================================================

import { supabase } from '@/lib/supabase';

/**
 * supabase-js reports any non-2xx from an edge function as a generic
 * "Edge Function returned a non-2xx status code" and stashes the actual
 * Response on error.context. Dig our JSON body ({ ok, error, stage, … }) out of
 * it so the UI can show the real reason instead of the generic message.
 */
async function readFunctionError(error: unknown): Promise<HmrcSubmitResult | null> {
  try {
    const ctx = (error as { context?: unknown })?.context as { json?: () => Promise<unknown> } | undefined;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body && typeof body === 'object' && ('error' in body || 'message' in body || 'ok' in body)) {
        return body as HmrcSubmitResult;
      }
    }
  } catch { /* fall through to the generic message */ }
  return null;
}

export interface HmrcSubmitInput {
  claimId: string;
  gatewayUserId: string;
  gatewayPassword: string;
  environment: 'test' | 'live';
}

export interface HmrcSubmitResult {
  ok: boolean;
  correlationId?: string;
  irMark?: string;
  donationCount?: number;
  environment?: string;
  message?: string;
  stage?: string;
  error?: string;
  /** true when the claim was already terminal (accepted/rejected) at poll time. */
  terminal?: boolean;
}

export interface HmrcPollInput {
  claimId: string;
  gatewayUserId: string;
  gatewayPassword: string;
  environment: 'test' | 'live';
}

export async function submitClaimToHmrc(input: HmrcSubmitInput): Promise<HmrcSubmitResult> {
  const { data, error } = await supabase.functions.invoke('gift-aid-hmrc-submit', {
    body: {
      claimId: input.claimId,
      gatewayUserId: input.gatewayUserId,
      gatewayPassword: input.gatewayPassword,
      environment: input.environment,
    },
  });
  if (error) {
    const body = await readFunctionError(error);
    if (body) return body;
    return { ok: false, error: error.message || 'Submission failed' };
  }
  return (data || { ok: false, error: 'No response from submission service' }) as HmrcSubmitResult;
}

/**
 * Re-poll a claim that HMRC hadn't confirmed by the time the submit function's
 * budget ran out (stage:'poll-timeout'). Fetches the final receipt/errors and
 * updates the claim. `environment` must match the original submission.
 */
export async function pollClaimToHmrc(input: HmrcPollInput): Promise<HmrcSubmitResult> {
  const { data, error } = await supabase.functions.invoke('gift-aid-hmrc-poll', {
    body: {
      claimId: input.claimId,
      gatewayUserId: input.gatewayUserId,
      gatewayPassword: input.gatewayPassword,
      environment: input.environment,
    },
  });
  if (error) {
    const body = await readFunctionError(error);
    if (body) return body;
    return { ok: false, error: error.message || 'Poll failed' };
  }
  return (data || { ok: false, error: 'No response from poll service' }) as HmrcSubmitResult;
}
