import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, getInscription } from './lib/supabase';
import { isPreviewDeployment } from './lib/preview';

const protectedPrefixes = ['/dashboard', '/parties', '/modules', '/cours', '/api'];

// Content scrapers used to train or feed AI models. They ignore (or only
// partly honour) robots.txt, so the preview deployment answers them with a
// 404. Google-Extended is a robots.txt token, handled in /robots.txt.
const AI_CRAWLER_PATTERN =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|Claude-SearchBot|Claude-User|anthropic-ai|CCBot|PerplexityBot|Perplexity-User|Amazonbot|Bytespider|Applebot-Extended|meta-externalagent|FacebookBot|cohere-ai|Diffbot|YouBot|Timpibot|omgili)/i;

const PREVIEW_ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet';

export const onRequest = defineMiddleware(async (context, next) => {
  if (isPreviewDeployment()) {
    context.locals.user = null;
    context.locals.inscription = null;
    context.locals.supabase = null;

    if (AI_CRAWLER_PATTERN.test(context.request.headers.get('user-agent') ?? '')) {
      return new Response('Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          Vary: 'User-Agent',
          'X-Robots-Tag': PREVIEW_ROBOTS_TAG,
        },
      });
    }

    const original = await next();
    const response = new Response(original.body, original);
    response.headers.set('X-Robots-Tag', PREVIEW_ROBOTS_TAG);
    return response;
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
    // API routes answer JSON themselves; pages redirect to login.
    if (context.url.pathname.startsWith('/api/')) return next();
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
