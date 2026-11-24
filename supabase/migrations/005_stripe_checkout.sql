-- Stripe checkout: payment references, 10x instalment tracking and welcome email.
-- Apply in the Supabase dashboard (SQL editor) after 004_livrables.sql.

alter table public.pragma_inscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_price_id text,
  add column if not exists payment_mode text,
  add column if not exists installments_total integer,
  add column if not exists installments_paid integer not null default 0,
  add column if not exists last_stripe_invoice_id text,
  add column if not exists subscription_status text,
  add column if not exists subscription_end_date date,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists access_start_date date,
  add column if not exists access_end_date date;

-- Idempotency keys for the Stripe webhook.
create unique index if not exists pragma_inscriptions_checkout_session_idx
  on public.pragma_inscriptions(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists pragma_inscriptions_subscription_idx
  on public.pragma_inscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists pragma_inscriptions_email_lower_idx
  on public.pragma_inscriptions (lower(trim(email)));

comment on column public.pragma_inscriptions.stripe_checkout_session_id is
  'Stripe Checkout Session id — used to make the webhook idempotent.';
comment on column public.pragma_inscriptions.installments_total is
  'Number of payments expected: 1 for a one-off payment, 10 for the 10x subscription.';
comment on column public.pragma_inscriptions.installments_paid is
  'Number of payments received so far.';
comment on column public.pragma_inscriptions.subscription_end_date is
  'Planned end of the 10x subscription in Stripe (end of the 10th billing period).';
comment on column public.pragma_inscriptions.welcome_email_sent_at is
  'Timestamp of the Resend welcome email, null until it has been sent.';
