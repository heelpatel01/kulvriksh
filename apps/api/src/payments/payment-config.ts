import type { NodeEnv } from '../config.ts';

// Payment settings (Flows §5, DM §6). Business values are NOT decided here: prices are entered by
// admins (R12), plan → entitlement mapping is per plan (R14), and which features are gated is
// configuration that defaults to none (R14). The currency is provisional (DQ-2). Reconciliation
// timings are provisional (FQ-18). Refunds are excluded (D3).
//
// PAYMENT_PROVIDER:
//   none        — default; ordering answers 503, nothing pretends to take payments.
//   development — local development only: a simulated gateway with real signature checks.
//   razorpay    — needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET. Outside
//                 production only test-mode keys (rzp_test_…) are accepted.

export type PaymentProviderName = 'none' | 'development' | 'razorpay';

/** Features that can be gated by an entitlement (F-ORD-06). Adding one is a code change. */
export const GATEABLE_FEATURES = ['tree_export'] as const;
export type GateableFeature = (typeof GATEABLE_FEATURES)[number];

export const ENTITLEMENT_KEY = /^[a-z][a-z_]*(\.[a-z][a-z_]*)*$/;

export interface PaymentConfig {
  readonly provider: PaymentProviderName;
  readonly currency: string;
  readonly razorpay?: { readonly keyId: string; readonly keySecret: string; readonly webhookSecret: string; readonly apiBase: string; readonly mode: 'test' | 'live' };
  /** Every provider call has this timeout and runs outside any database transaction. */
  readonly providerTimeoutMs: number;
  readonly reconcile: {
    readonly intervalSeconds: number;
    /** Orders younger than this are left to the live checkout. */
    readonly minAgeSeconds: number;
    readonly lookbackDays: number;
    readonly batchSize: number;
    /** Unpaid orders still unconfirmed after this many checks go to the attention queue. */
    readonly attentionAfterChecks: number;
  };
  readonly grant: { readonly maxAttempts: number; readonly retrySeconds: number };
  /** feature → entitlement key required to use it. Empty = nothing is gated. */
  readonly gates: Readonly<Partial<Record<GateableFeature, string>>>;
}

function bounded(name: string, raw: string | undefined, fallback: number, min: number, max: number, issues: string[]): number {
  const value = raw?.trim();
  if (!value) {
    return fallback;
  }
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    issues.push(`${name} must be an integer from ${min} to ${max}`);
    return fallback;
  }
  return Number(value);
}

function readGates(raw: string | undefined, issues: string[]): PaymentConfig['gates'] {
  const value = raw?.trim();
  if (!value) {
    return {};
  }
  const gates: Partial<Record<GateableFeature, string>> = {};
  for (const pair of value.split(',')) {
    const [feature, key] = pair.split('=').map((s) => s.trim());
    if (!feature || !(GATEABLE_FEATURES as readonly string[]).includes(feature) || !key || !ENTITLEMENT_KEY.test(key) || key.length > 80) {
      issues.push(`ENTITLEMENT_GATES must be a list like tree_export=family.export (features: ${GATEABLE_FEATURES.join(', ')})`);
      return {};
    }
    gates[feature as GateableFeature] = key;
  }
  return gates;
}

export function readPaymentConfig(env: NodeJS.ProcessEnv, nodeEnv: NodeEnv, issues: string[]): PaymentConfig {
  const provider = (env.PAYMENT_PROVIDER?.trim() || 'none') as PaymentProviderName;
  if (!['none', 'development', 'razorpay'].includes(provider)) {
    issues.push('PAYMENT_PROVIDER must be none, development or razorpay');
  }
  if (provider === 'development' && nodeEnv !== 'development') {
    issues.push('PAYMENT_PROVIDER=development is a development-only setting and must not be used outside development');
  }
  const currency = env.PAYMENT_CURRENCY?.trim() || 'INR';
  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push('PAYMENT_CURRENCY must be a three-letter ISO 4217 code, e.g. INR');
  }
  let razorpay: PaymentConfig['razorpay'];
  if (provider === 'razorpay') {
    const keyId = env.RAZORPAY_KEY_ID?.trim() ?? '';
    const keySecret = env.RAZORPAY_KEY_SECRET?.trim() ?? '';
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? '';
    const match = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.exec(keyId);
    if (!match) {
      issues.push('RAZORPAY_KEY_ID must look like rzp_test_… or rzp_live_…');
    } else if (match[1] === 'live' && nodeEnv !== 'production') {
      issues.push('RAZORPAY_KEY_ID: live keys are refused outside production; use a test-mode key');
    }
    // Secrets are checked for presence and length only; they are never logged or echoed.
    if (keySecret.length < 12) {
      issues.push('RAZORPAY_KEY_SECRET is required with PAYMENT_PROVIDER=razorpay');
    }
    if (webhookSecret.length < 12) {
      issues.push('RAZORPAY_WEBHOOK_SECRET is required with PAYMENT_PROVIDER=razorpay');
    }
    const apiBase = env.RAZORPAY_API_BASE?.trim() || 'https://api.razorpay.com';
    if (apiBase !== 'https://api.razorpay.com' && nodeEnv === 'production') {
      issues.push('RAZORPAY_API_BASE can only be changed outside production (for a local test double)');
    }
    razorpay = { keyId, keySecret, webhookSecret, apiBase, mode: match?.[1] === 'live' ? 'live' : 'test' };
  }
  return {
    provider: ['none', 'development', 'razorpay'].includes(provider) ? provider : 'none',
    currency,
    ...(razorpay ? { razorpay } : {}),
    providerTimeoutMs: bounded('PAYMENT_PROVIDER_TIMEOUT_MS', env.PAYMENT_PROVIDER_TIMEOUT_MS, 8000, 1000, 30_000, issues),
    reconcile: {
      intervalSeconds: bounded('RECONCILE_INTERVAL_SECONDS', env.RECONCILE_INTERVAL_SECONDS, 600, 30, 86_400, issues),
      minAgeSeconds: bounded('RECONCILE_MIN_AGE_SECONDS', env.RECONCILE_MIN_AGE_SECONDS, 900, 0, 86_400, issues),
      lookbackDays: bounded('RECONCILE_LOOKBACK_DAYS', env.RECONCILE_LOOKBACK_DAYS, 7, 1, 90, issues),
      batchSize: bounded('RECONCILE_BATCH_SIZE', env.RECONCILE_BATCH_SIZE, 50, 1, 500, issues),
      attentionAfterChecks: bounded('RECONCILE_ATTENTION_AFTER_CHECKS', env.RECONCILE_ATTENTION_AFTER_CHECKS, 12, 1, 1000, issues),
    },
    grant: {
      maxAttempts: bounded('GRANT_MAX_ATTEMPTS', env.GRANT_MAX_ATTEMPTS, 5, 1, 50, issues),
      retrySeconds: bounded('GRANT_RETRY_SECONDS', env.GRANT_RETRY_SECONDS, 60, 1, 86_400, issues),
    },
    gates: readGates(env.ENTITLEMENT_GATES, issues),
  };
}
