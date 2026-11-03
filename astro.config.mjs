import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { storyblok } from '@storyblok/astro';

// NOTE: `import.meta.env` is not available inside astro.config.mjs, so load
// env vars explicitly. Otherwise the Storyblok accessToken silently falls back
// to an invalid placeholder and every CDN request fails with 401 Unauthorized.
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');

const STORYBLOK_TOKEN = env.STORYBLOK_TOKEN || process.env.STORYBLOK_TOKEN;
const STORYBLOK_REGION = env.STORYBLOK_REGION || process.env.STORYBLOK_REGION || 'eu';
const IS_PREVIEW = env.IS_PREVIEW || process.env.IS_PREVIEW;
const STORYBLOK_ENABLE_BRIDGE =
  env.STORYBLOK_ENABLE_BRIDGE || process.env.STORYBLOK_ENABLE_BRIDGE;

// Canonical origin of the deployed site. Production lives on `www`, with the
// apex domain redirecting there. A missing or placeholder SITE_URL used to
// leave `site` on `https://yourdomain.com`, which made Astro reject every
// form POST in production ("Cross-site POST form submissions are forbidden")
// and sent magic links to the wrong host. Fall back to the real domain.
const FALLBACK_SITE_URL = 'https://www.pragma-formation.fr';
const SITE_URL = (() => {
  const raw = (env.SITE_URL || process.env.SITE_URL || '').trim();
  if (!raw || /yourdomain\.com/i.test(raw)) return FALLBACK_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
})();

// Hosts Astro must trust when reconstructing the request URL (origin check
// for form POSTs). Without this, `context.url` falls back to localhost and
// every form submission (login, logout, progress) gets a 403 in production.
// Accept both the apex and the `www` host so the check passes whichever one
// is configured in SITE_URL.
const SITE_HOSTS = (() => {
  const hostname = new URL(SITE_URL).hostname;
  const sibling = hostname.startsWith('www.') ? hostname.slice(4) : `www.${hostname}`;
  return [...new Set([hostname, sibling])];
})();

// Only the public marketing pages belong in the sitemap; the learner area and
// auth routes are private and must stay out of search results.
const SITEMAP_PATHS = new Set(['/', '/contact', '/equipe', '/programme']);

// https://astro.build/config
export default defineConfig({
  output: 'server',
  devToolbar: {
    enabled: false,
  },

  adapter: vercel({
    webAnalytics: { enabled: true },
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    storyblok({
      accessToken: STORYBLOK_TOKEN,
      components: {
        page: 'components/storyblok/Page',
        bloc_comprendre: 'components/storyblok/BlocComprendre',
        bloc_quiz: 'components/storyblok/BlocQuiz',
        bloc_guide: 'components/storyblok/BlocGuide',
        bloc_action: 'components/storyblok/BlocAction',
        bloc_blueprint: 'components/storyblok/BlocBlueprint',
        bloc_youtube: 'components/storyblok/BlocYoutube',
      },
      enableFallbackComponent: true,
      customFallbackComponent: 'components/storyblok/StoryblokFallback',
      bridge: IS_PREVIEW === 'true' && STORYBLOK_ENABLE_BRIDGE === 'true',
      apiOptions: {
        region: STORYBLOK_REGION,
      },
    }),
    sitemap({
      filter: (page) => {
        // A preview build must never publish a sitemap of production URLs.
        if (IS_PREVIEW === 'true') return false;
        const pathname = new URL(page).pathname.replace(/\/+$/, '') || '/';
        return SITEMAP_PATHS.has(pathname);
      },
    }),
  ],

  site: SITE_URL,

  security: {
    allowedDomains: [
      // Production custom domain, apex and `www`, from SITE_URL env.
      ...SITE_HOSTS.map((hostname) => ({ hostname })),
      // Vercel preview deployments (*.vercel.app).
      { hostname: '*.vercel.app' },
      // Local dev (any port).
      { hostname: 'localhost' },
      { hostname: '127.0.0.1' },
    ],
  },
});
