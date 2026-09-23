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
const SITE_URL = env.SITE_URL || process.env.SITE_URL || 'https://yourdomain.com';
const IS_PREVIEW = env.IS_PREVIEW || process.env.IS_PREVIEW;
const STORYBLOK_ENABLE_BRIDGE =
  env.STORYBLOK_ENABLE_BRIDGE || process.env.STORYBLOK_ENABLE_BRIDGE;

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
      },
      enableFallbackComponent: true,
      customFallbackComponent: 'components/storyblok/StoryblokFallback',
      bridge: IS_PREVIEW === 'true' && STORYBLOK_ENABLE_BRIDGE === 'true',
      apiOptions: {
        region: STORYBLOK_REGION,
      },
    }),
    sitemap(),
  ],

  site: SITE_URL,
});
