import Stripe from 'stripe';

export type PlanId = 'autonome' | 'mentoree';
export type PaymentMode = 'once' | 'monthly';

export interface PlanConfig {
  label: string;
  optionName: string;
  onceTotal: number;
  monthlyAmount: number;
  monthlyTotal: number;
  installments: number;
  correction: boolean;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  autonome: {
    label: 'Autonome',
    optionName: 'Autonome',
    onceTotal: 490,
    monthlyAmount: 59,
    monthlyTotal: 590,
    installments: 10,
    correction: false,
  },
  mentoree: {
    label: 'Mentorée',
    optionName: 'Mentorée',
    onceTotal: 2190,
    monthlyAmount: 239,
    monthlyTotal: 2390,
    installments: 10,
    correction: true,
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return value === 'autonome' || value === 'mentoree';
}

export function isPaymentMode(value: unknown): value is PaymentMode {
  return value === 'once' || value === 'monthly';
}

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY || import.meta.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY manquant.');
  return new Stripe(secretKey, { maxNetworkRetries: 2 });
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET || import.meta.env.STRIPE_WEBHOOK_SECRET;
}

/**
 * Price IDs are configured in the environment so test/live keys can be swapped
 * without touching the code.
 */
export function getStripePriceId(plan: PlanId, payment: PaymentMode): string | undefined {
  switch (`${plan}_${payment}`) {
    case 'autonome_once':
      return process.env.STRIPE_PRICE_AUTONOME_ONCE || import.meta.env.STRIPE_PRICE_AUTONOME_ONCE;
    case 'autonome_monthly':
      return process.env.STRIPE_PRICE_AUTONOME_10X || import.meta.env.STRIPE_PRICE_AUTONOME_10X;
    case 'mentoree_once':
      return process.env.STRIPE_PRICE_MENTOREE_ONCE || import.meta.env.STRIPE_PRICE_MENTOREE_ONCE;
    case 'mentoree_monthly':
      return process.env.STRIPE_PRICE_MENTOREE_10X || import.meta.env.STRIPE_PRICE_MENTOREE_10X;
    default:
      return undefined;
  }
}

export function getSiteUrl(fallback?: URL): URL {
  const configured = process.env.SITE_URL || import.meta.env.SITE_URL;
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // Fall through to the request URL.
    }
  }
  return fallback ?? new URL('https://www.pragma-formation.fr');
}

/** Add whole months, clamping to the last day of the target month. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInMonth));
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * End of the Nth billing period, used to stop the 10x subscription after the
 * last instalment. Works for daily, weekly, monthly and yearly prices.
 */
export function addBillingPeriods(
  date: Date,
  interval: string | null | undefined,
  intervalCount: number,
  periods: number
): Date {
  const total = Math.max(1, intervalCount) * Math.max(1, periods);
  switch (interval) {
    case 'day':
      return addDays(date, total);
    case 'week':
      return addDays(date, total * 7);
    case 'year':
      return addMonths(date, total * 12);
    case 'month':
    default:
      return addMonths(date, total);
  }
}

export interface CheckoutSessionMetadata {
  plan: PlanId;
  payment: PaymentMode;
  price_id?: string;
}
