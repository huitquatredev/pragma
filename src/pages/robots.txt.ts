import type { APIRoute } from 'astro';
import { isPreviewDeployment } from '../lib/preview';

const FALLBACK_SITE_URL = 'https://www.pragma-formation.fr';

// Explicit groups for crawlers that feed AI training/answers. Google-Extended
// is a robots.txt token (not a user agent), so it has to be listed here.
const AI_AGENTS = [
  'Google-Extended',
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'Amazonbot',
  'Bytespider',
  'Applebot-Extended',
  'meta-externalagent',
  'FacebookBot',
  'cohere-ai',
];

export const GET: APIRoute = ({ site }) => {
  // The Storyblok preview deployment must never be crawled or indexed. It is
  // additionally protected by Vercel Deployment Protection; this is a second
  // layer in case that protection is ever disabled.
  if (isPreviewDeployment()) {
    const groups = ['*', ...AI_AGENTS].map((agent) => `User-agent: ${agent}\nDisallow: /`);

    return new Response(`${groups.join('\n\n')}\n`, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  }

  const base = site ?? new URL(FALLBACK_SITE_URL);
  const sitemap = new URL('sitemap-index.xml', base).href;

  const body = `User-agent: *
Allow: /

# Private learner area and auth endpoints.
Disallow: /dashboard
Disallow: /login
Disallow: /auth/
Disallow: /api/
Disallow: /cours/
Disallow: /modules/
Disallow: /parties/

Sitemap: ${sitemap}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
