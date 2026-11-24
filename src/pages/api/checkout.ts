import type { APIRoute } from 'astro';
import { getSiteUrl, getStripe, getStripePriceId, isPaymentMode, isPlanId } from '../../lib/stripe';

function back(context: Parameters<APIRoute>[0], reason: string) {
  return context.redirect(`/acheter?erreur=${encodeURIComponent(reason)}#formules`, 303);
}

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return back(context, 'requete');
  }

  const plan = String(form.get('plan') ?? '');
  const payment = String(form.get('payment') ?? '');

  if (!isPlanId(plan) || !isPaymentMode(payment)) {
    return back(context, 'formule');
  }

  const priceId = getStripePriceId(plan, payment);
  if (!priceId) {
    console.error(`[checkout] Price ID manquant pour ${plan}/${payment}.`);
    return back(context, 'configuration');
  }

  const site = getSiteUrl(context.site ?? context.url);
  const successUrl = new URL('/acheter/merci', site);
  const cancelUrl = new URL('/acheter', site);
  cancelUrl.searchParams.set('annule', '1');
  cancelUrl.hash = 'formules';

  const metadata = { plan, payment, price_id: priceId };
  const isSubscription = payment === 'monthly';

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      locale: 'fr',
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      submit_type: 'pay',
      // Keep the literal placeholder: Stripe replaces it with the session ID.
      success_url: `${successUrl.origin}${successUrl.pathname}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl.href,
      metadata,
      ...(isSubscription
        ? { subscription_data: { metadata } }
        : {
            customer_creation: 'always',
            payment_intent_data: { metadata },
          }),
    });

    if (!session.url) {
      console.error('[checkout] Stripe n’a pas renvoyé d’URL de session.', session.id);
      return back(context, 'paiement');
    }

    return context.redirect(session.url, 303);
  } catch (error) {
    console.error(
      '[checkout] Création de la session Stripe impossible:',
      error instanceof Error ? error.message : error
    );
    return back(context, 'paiement');
  }
};
