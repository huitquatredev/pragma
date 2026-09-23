import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, getInscription } from './lib/supabase';

const protectedPrefixes = ['/dashboard', '/parties', '/modules', '/cours'];

export const onRequest = defineMiddleware(async (context, next) => {
  const isPreview = process.env.IS_PREVIEW === 'true' || import.meta.env.IS_PREVIEW === 'true';

  if (isPreview) {
    context.locals.user = null;
    context.locals.inscription = null;
    context.locals.supabase = null;
    return next();
  }

  const isProtected = protectedPrefixes.some((prefix) => context.url.pathname.startsWith(prefix));
  if (!isProtected) {
    context.locals.user = null;
    context.locals.inscription = null;
    context.locals.supabase = null;
    return next();
  }

  const supabase = createSupabaseServerClient(context);

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  context.locals.user = user;
  context.locals.inscription = null;
  context.locals.supabase = user ? supabase : null;

  if (!user) {
    return context.redirect(`/login?next=${encodeURIComponent(context.url.pathname)}`);
  }

  if (user.email) {
    try {
      context.locals.inscription = await getInscription(supabase, user.email);
    } catch {
      context.locals.inscription = null;
    }
  }

  return next();
});
