-- Brevo marketing list: track when the buyer has been added to the list.
-- Apply in the Supabase dashboard (SQL editor) after 005_stripe_checkout.sql.

alter table public.pragma_inscriptions
  add column if not exists brevo_synced_at timestamptz;

comment on column public.pragma_inscriptions.brevo_synced_at is
  'Timestamp of the Brevo contact/list sync, null until the buyer has been added.';

-- welcome_email_sent_at from migration 005 is no longer used: the welcome email
-- was replaced by the Brevo list sync. The column is kept for existing installs.
