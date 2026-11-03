import { defineMiddleware } from 'astro:middleware';
import type { APIContext } from 'astro';
import { createSupabaseServerClient, getInscription } from './lib/supabase';
import { isPreviewDeployment } from './lib/preview';
import {
  getStoryblokPreviewEnv,
  isStoryblokPreviewRequest,
  parsePreviewCookie,
  readStoryblokPreviewParams,
  serializePreviewParams,
} from './lib/storyblok-preview';

const protectedPrefixes = ['/dashboard', '/parties', '/modules', '/cours', '/api'];

// Content scrapers used to train or feed AI models. They ignore (or only
// partly honour) robots.txt, so the preview deployment answers them with a
// 404. Google-Extended is a robots.txt token, handled in /robots.txt.
const AI_CRAWLER_PATTERN =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|Claude-SearchBot|Claude-User|anthropic-ai|CCBot|PerplexityBot|Perplexity-User|Amazonbot|Bytespider|Applebot-Extended|meta-externalagent|FacebookBot|cohere-ai|Diffbot|YouBot|Timpibot|omgili)/i;

const PREVIEW_ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet';
const PREVIEW_COOKIE = 'pragma_preview';
const PREVIEW_COOKIE_MAX_AGE = 60 * 60;
const PREVIEW_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

let warnedMissingPreviewToken = false;

function previewNotFound(): Response {
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

/**
 * The preview is only served to the Storyblok Visual Editor. Storyblok signs
 * every iframe URL with `_storyblok_tk`; once validated we keep the same
 * proof in a cookie so in-preview navigation keeps working.
 */
function hasPreviewAccess(context: APIContext): boolean {
  const env = getStoryblokPreviewEnv();

  if (!env.previewToken) {
    if (!warnedMissingPreviewToken) {
      // eslint-disable-next-line no-console
      console.warn(
        '[preview] STORYBLOK_PREVIEW_TOKEN (or STORYBLOK_TOKEN) is missing; all preview requests are blocked.'
      );
      warnedMissingPreviewToken = true;
    }
    return false;
  }

  const urlParams = readStoryblokPreviewParams(context.url);
  if (urlParams && isStoryblokPreviewRequest(urlParams, env)) {
    context.cookies.set(PREVIEW_COOKIE, serializePreviewParams(urlParams), {
      httpOnly: true,
      secure: context.url.protocol === 'https:',
      sameSite: 'none',
      path: '/',
      maxAge: PREVIEW_COOKIE_MAX_AGE,
    });
    return true;
  }

  const cookieParams = parsePreviewCookie(context.cookies.get(PREVIEW_COOKIE)?.value);
  return !!cookieParams && isStoryblokPreviewRequest(cookieParams, env);
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (isPreviewDeployment()) {
    context.locals.user = null;
    context.locals.inscription = null;
    context.locals.supabase = null;

    if (AI_CRAWLER_PATTERN.test(context.request.headers.get('user-agent') ?? '')) {
      return previewNotFound();
    }

    // Local dev is open on loopback; a deployed preview only answers
    // requests signed by Storyblok. `import.meta.env.DEV` prevents a spoofed
    // Host header from bypassing the gate in production.
    const isLocalDev = import.meta.env.DEV && PREVIEW_LOCAL_HOSTS.has(context.url.hostname);
    if (!isLocalDev && !hasPreviewAccess(context)) {
      return previewNotFound();
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
