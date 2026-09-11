import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, getInscription } from './lib/supabase';

const protectedPrefixes = ['/dashboard', '/parties', '/modules', '/cours'];

export const onRequest = defineMiddleware(async (context, next) => {
  const isProtected = protectedPrefixes.some((prefix) => context.url.pathname.startsWith(prefix));
  if (!isProtected) {
    context.locals.user = null;
    context.locals.inscription = null;
    return next();
  }

  const supabase = createSupabaseServerClient(context);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user;
  context.locals.inscription = null;

  if (!user) {
    return context.redirect(`/login?next=${encodeURIComponent(context.url.pathname)}`);
  }

  if (user.email) {
    context.locals.inscription = await getInscription(supabase, user.email);
  }

  return next();
});
