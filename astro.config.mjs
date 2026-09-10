import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { storyblok } from '@storyblok/astro';

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
      accessToken: import.meta.env.STORYBLOK_TOKEN || 'your_token_here',
      components: {
        page: 'components/storyblok/Page',
      },
      enableFallbackComponent: true,
      customFallbackComponent: 'components/storyblok/StoryblokFallback',
      bridge:
        import.meta.env.IS_PREVIEW === 'true' && import.meta.env.STORYBLOK_ENABLE_BRIDGE === 'true',
      apiOptions: {
        region: import.meta.env.STORYBLOK_REGION || 'eu',
      },
    }),
    sitemap(),
  ],

  site: import.meta.env.SITE_URL || 'https://yourdomain.com',
});
