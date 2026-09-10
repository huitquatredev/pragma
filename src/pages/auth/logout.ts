import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

export const POST: APIRoute = async (context) => {
  const supabase = createSupabaseServerClient(context);
  const { error } = await supabase.auth.signOut();
  if (error) return new Response('Impossible de fermer la session.', { status: 500 });
  return context.redirect('/');
};
