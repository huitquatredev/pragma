import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '../../../lib/supabase';
import {
  addBillingPeriods,
  addMonths,
  getStripe,
  getStripeWebhookSecret,
  isPaymentMode,
  isPlanId,
  PLANS,
  type PaymentMode,
  type PlanId,
} from '../../../lib/stripe';
import { isEmailConfigured } from '../../../lib/email';
import { sendWelcomeEmail } from '../../../lib/welcome-email';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

function objectId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function splitName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(' ') || null,
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const legacySubscription = (
    invoice as unknown as { subscription?: string | Stripe.Subscription | null }
  ).subscription;
  return objectId(parentSubscription) ?? objectId(legacySubscription);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function deliverWelcomeEmail(args: {
  supabase: SupabaseAdmin;
  rowId: number;
  email: string;
  firstName: string | null;
  plan: PlanId;
  payment: PaymentMode;
  accessEndDate: Date;
}) {
  const result = await sendWelcomeEmail({
    to: args.email,
    firstName: args.firstName,
    plan: args.plan,
    payment: args.payment,
    accessEndDate: args.accessEndDate,
  });

  if (!result.sent) {
    console.error(`[stripe] Email de bienvenue non envoyé pour ${args.email}: ${result.reason}`);
    // If Resend is configured, let Stripe retry the webhook instead of silently
    // losing the welcome email.
    if (isEmailConfigured()) {
      throw new Error(`Email de bienvenue non envoyé: ${result.reason ?? 'inconnu'}`);
    }
    return;
  }

  const { error } = await args.supabase
    .from('pragma_inscriptions')
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq('id', args.rowId);
  if (error) {
    console.error(
      '[stripe] Impossible de marquer le mail de bienvenue comme envoyé:',
      error.message
    );
  }
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const paidStatus =
    session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!paidStatus) {
    console.log(
      `[stripe] Session ${session.id} non payée (${session.payment_status}), en attente.`
    );
    return;
  }

  const plan = session.metadata?.plan;
  const payment = session.metadata?.payment;
  if (!isPlanId(plan) || !isPaymentMode(payment)) {
    console.error(`[stripe] Métadonnées invalides sur la session ${session.id}.`, {
      plan,
      payment,
    });
    return;
  }

  const planConfig = PLANS[plan];
  const supabase = createSupabaseAdminClient();

  // Stripe can deliver the same event more than once. The session id is our
  // idempotency key: if the row already exists, only retry a missing welcome
  // email.
  const { data: existingBySession, error: sessionLookupError } = await supabase
    .from('pragma_inscriptions')
    .select('id, email, first_name, access_end_date, welcome_email_sent_at')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();
  if (sessionLookupError) throw new Error(sessionLookupError.message);

  if (existingBySession) {
    if (!existingBySession.welcome_email_sent_at && existingBySession.email) {
      await deliverWelcomeEmail({
        supabase,
        rowId: existingBySession.id,
        email: existingBySession.email,
        firstName: existingBySession.first_name ?? null,
        plan,
        payment,
        accessEndDate: existingBySession.access_end_date
          ? new Date(existingBySession.access_end_date)
          : addMonths(new Date(), 18),
      });
    }
    return;
  }

  const email = (session.customer_details?.email || session.customer_email || '').trim();
  if (!email) {
    throw new Error(`Email client manquant pour la session Stripe ${session.id}.`);
  }

  const { firstName, lastName } = splitName(session.customer_details?.name);
  const customerId = objectId(session.customer);
  const subscriptionId = objectId(session.subscription);
  const priceId = session.metadata?.price_id ?? null;
  const now = new Date();
  const accessEnd = addMonths(now, 18);
  const isMonthly = payment === 'monthly';
  const installmentsTotal = isMonthly ? planConfig.installments : 1;
  const installmentsPaid = 1;
  const totalPrice = isMonthly ? planConfig.monthlyTotal : planConfig.onceTotal;
  // Use the amount actually charged first (discounts/promotions included).
  const currentlyPaid =
    typeof session.amount_total === 'number'
      ? session.amount_total / 100
      : isMonthly
        ? planConfig.monthlyAmount
        : planConfig.onceTotal;

  let subscriptionStatus: string | null = null;
  let subscriptionPriceId = priceId;
  let subscriptionEndDate: string | null = null;

  if (isMonthly && subscriptionId) {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    subscriptionStatus = subscription.status;
    subscriptionPriceId = subscription.items.data[0]?.price?.id ?? subscriptionPriceId;

    // The 10x price is an unlimited subscription. Cancel it at the end of the
    // 10th billing period, so the customer pays exactly 10 instalments. The
    // billing cycle anchor is the subscription start date.
    const anchor = new Date(subscription.billing_cycle_anchor * 1000);
    const recurring = subscription.items.data[0]?.price?.recurring;
    const cancelAt = addBillingPeriods(
      anchor,
      recurring?.interval,
      recurring?.interval_count ?? 1,
      installmentsTotal
    );
    subscriptionEndDate = dateOnly(cancelAt);
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at: Math.floor(cancelAt.getTime() / 1000),
      metadata: {
        ...subscription.metadata,
        plan,
        payment,
        installments_total: String(installmentsTotal),
        price_id: subscriptionPriceId ?? '',
      },
    });
  }

  const paymentMethod = isMonthly ? 'recurrent' : 'payment';
  const stripeFields = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_checkout_session_id: session.id,
    stripe_price_id: subscriptionPriceId,
    payment_mode: payment,
    installments_total: installmentsTotal,
    installments_paid: installmentsPaid,
    subscription_status: subscriptionStatus,
    subscription_end_date: subscriptionEndDate,
    access_start_date: dateOnly(now),
    access_end_date: dateOnly(accessEnd),
    welcome_email_sent_at: null,
  };

  // A customer may already exist in the table (lead, previous purchase, or an
  // import). Update that row rather than creating a duplicate.
  const { data: existingByEmail, error: emailLookupError } = await supabase
    .from('pragma_inscriptions')
    .select('id, first_name, last_name, phone, correction, access_end_date, remarks')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  if (emailLookupError) throw new Error(emailLookupError.message);

  let rowId: number;
  let finalAccessEnd = accessEnd;

  if (existingByEmail) {
    const previousAccessEnd = existingByEmail.access_end_date
      ? new Date(existingByEmail.access_end_date)
      : null;
    finalAccessEnd =
      previousAccessEnd && previousAccessEnd > accessEnd ? previousAccessEnd : accessEnd;

    const { error } = await supabase
      .from('pragma_inscriptions')
      .update({
        first_name: firstName ?? existingByEmail.first_name ?? null,
        last_name: lastName ?? existingByEmail.last_name ?? null,
        phone: session.customer_details?.phone || existingByEmail.phone || '',
        option_name: planConfig.optionName,
        payment_method: paymentMethod,
        total_price: totalPrice,
        currently_paid: currentlyPaid,
        // Both formulas include the full 9-part programme.
        upgrade: true,
        correction: Boolean(existingByEmail.correction) || planConfig.correction,
        remarks: [existingByEmail.remarks, `Achat Stripe ${session.id}`].filter(Boolean).join('\n'),
        ...stripeFields,
        access_end_date: dateOnly(finalAccessEnd),
      })
      .eq('id', existingByEmail.id);
    if (error) throw new Error(error.message);
    rowId = existingByEmail.id;
  } else {
    const { data: inserted, error } = await supabase
      .from('pragma_inscriptions')
      .insert({
        email,
        first_name: firstName,
        last_name: lastName,
        phone: session.customer_details?.phone || '',
        registration_date: dateOnly(now),
        option_name: planConfig.optionName,
        payment_method: paymentMethod,
        total_price: totalPrice,
        currently_paid: currentlyPaid,
        correction: planConfig.correction,
        // Both formulas include the full 9-part programme.
        upgrade: true,
        camille: false,
        siteweb: false,
        coaching: false,
        certification: false,
        remarks: `Achat Stripe ${session.id}`,
        ...stripeFields,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    rowId = inserted.id;
  }

  await deliverWelcomeEmail({
    supabase,
    rowId,
    email,
    firstName,
    plan,
    payment,
    accessEndDate: finalAccessEnd,
  });
}

async function recordInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const supabase = createSupabaseAdminClient();
  const { data: row, error } = await supabase
    .from('pragma_inscriptions')
    .select('id, installments_paid, installments_total, currently_paid, last_stripe_invoice_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return;

  if (row.last_stripe_invoice_id === invoice.id) return;

  // The first invoice is already counted when the checkout session is
  // completed, so only increment on renewals.
  const isFirstInvoice = invoice.billing_reason === 'subscription_create';
  const paidCount = Number(row.installments_paid ?? 0);
  const nextPaidCount = isFirstInvoice ? Math.max(paidCount, 1) : paidCount + 1;
  const addedAmount = isFirstInvoice ? 0 : invoice.amount_paid / 100;
  const currentlyPaid = Number(row.currently_paid ?? 0) + addedAmount;
  const totalInstallments = Number(row.installments_total ?? PLANS.autonome.installments);

  const { error: updateError } = await supabase
    .from('pragma_inscriptions')
    .update({
      installments_paid: nextPaidCount,
      currently_paid: currentlyPaid,
      last_stripe_invoice_id: invoice.id,
      subscription_status: 'active',
    })
    .eq('id', row.id);
  if (updateError) throw new Error(updateError.message);

  // Safety net: cancel at the end of the 10th paid period even if the
  // cancel_at date set at checkout was missed or altered.
  if (!isFirstInvoice && nextPaidCount >= totalInstallments) {
    try {
      await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    } catch (error) {
      console.error('[stripe] Impossible de programmer la fin de l’abonnement:', error);
    }
  }
}

async function updateSubscriptionStatus(subscription: Stripe.Subscription, status: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('pragma_inscriptions')
    .update({ subscription_status: status })
    .eq('stripe_subscription_id', subscription.id);
  if (error) throw new Error(error.message);
}

export const POST: APIRoute = async (context) => {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET manquant.');
    return json({ error: 'Webhook non configuré.' }, 500);
  }

  const signature = context.request.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Signature Stripe manquante.' }, 400);

  const payload = await context.request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error(
      '[stripe] Signature webhook invalide:',
      error instanceof Error ? error.message : error
    );
    return json({ error: 'Signature invalide.' }, 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
        await recordInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const supabase = createSupabaseAdminClient();
          await supabase
            .from('pragma_inscriptions')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }
      case 'customer.subscription.updated':
        await updateSubscriptionStatus(
          event.data.object as Stripe.Subscription,
          (event.data.object as Stripe.Subscription).status
        );
        break;
      case 'customer.subscription.deleted':
        await updateSubscriptionStatus(event.data.object as Stripe.Subscription, 'canceled');
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(
      `[stripe] Traitement de l’événement ${event.type} (${event.id}) impossible:`,
      error instanceof Error ? error.message : error
    );
    return json({ error: 'Traitement impossible.' }, 500);
  }

  return json({ received: true });
};
