import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = String(form.get('email') ?? '').trim();
  const next = String(form.get('next') ?? '/dashboard');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return context.redirect(`/login?error=${encodeURIComponent('Adresse email invalide')}`);
  }

  // Build the magic link against the canonical site URL (not the request
  // host) so it always points at the public `www` domain, even behind Vercel
  // proxies or on preview deployments.
  const redirectTo = new URL('/auth/callback', context.site ?? context.url);
  redirectTo.searchParams.set(
    'next',
    next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  );
  const supabase = createSupabaseServerClient(context);
  const { data: eligible, error: eligibilityError } = await supabase.rpc(
    'is_eligible_login_email',
    {
      candidate_email: email,
    }
  );
  if (eligibilityError) throw eligibilityError;
  if (!eligible) {
    return context.redirect(
      `/login?error=${encodeURIComponent('Cette adresse ne fait pas partie des inscriptions.')}`
    );
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo.toString() },
  });
  if (error) return context.redirect(`/login?error=${encodeURIComponent(error.message)}`);
  return context.redirect(
    `/login?error=${encodeURIComponent('Consultez votre boîte mail pour continuer.')}`
  );
};
