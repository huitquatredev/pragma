import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, getAccessEndDate, hasActiveAccess } from './lib/supabase';

const protectedPrefixes = ['/dashboard', '/parties', '/modules', '/cours'];
const learningPrefixes = ['/parties', '/modules', '/cours'];

export const onRequest = defineMiddleware(async (context, next) => {
  const isProtected = protectedPrefixes.some((prefix) => context.url.pathname.startsWith(prefix));
  if (!isProtected) {
    context.locals.user = null;
    context.locals.accessEndDate = null;
    return next();
  }

  const supabase = createSupabaseServerClient(context);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user;
  context.locals.accessEndDate = null;

  if (!user) {
    return context.redirect(`/login?next=${encodeURIComponent(context.url.pathname)}`);
  }

  const accessEndDate = await getAccessEndDate(supabase, user.id);
  context.locals.accessEndDate = accessEndDate;
  const isLearningRoute = learningPrefixes.some((prefix) =>
    context.url.pathname.startsWith(prefix)
  );
  if (isLearningRoute && !hasActiveAccess(accessEndDate)) {
    return context.redirect('/dashboard?access=expired');
  }

  return next();
});
