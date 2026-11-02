import type { APIRoute } from 'astro';

const FALLBACK_SITE_URL = 'https://www.pragma-formation.fr';

export const prerender = true;

// robots.txt is generated so the sitemap URL always follows the configured
// `site` (see astro.config.mjs) instead of duplicating the domain by hand.
export const GET: APIRoute = ({ site }) => {
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
