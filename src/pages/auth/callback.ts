import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get('code');
  const next = context.url.searchParams.get('next');
  if (!code) {
    return context.redirect(
      `/login?error=${encodeURIComponent('Le lien de connexion est invalide.')}`
    );
  }
  const supabase = createSupabaseServerClient(context);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const message = error.message.includes('code verifier')
      ? 'Ce lien doit être ouvert dans le même navigateur que celui utilisé pour demander le lien.'
      : error.message;
    return context.redirect(`/login?error=${encodeURIComponent(message)}`);
  }
  return context.redirect(next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
};
