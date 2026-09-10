import { useStoryblokApi } from '@storyblok/astro';

export interface StoryblokStory {
  uuid: string;
  slug: string;
  full_slug: string;
  content: {
    component: string;
    title: string;
    body?: unknown;
    description?: string;
    robots?: string;
    schema?: unknown;
    ogImage?: { filename: string; alt?: string };
    ogImageAlt?: string;
    canonical?: { url: string };
    modules?: StoryblokStory[];
    cours?: StoryblokStory[];
  };
}

export function getStoryblokApi() {
  return useStoryblokApi();
}

export async function fetchStory(slug: string) {
  const api = getStoryblokApi();
  const { data } = await api.get(`cdn/stories/${slug}`, {
    version: import.meta.env.IS_PREVIEW === 'true' ? 'draft' : 'published',
    token: import.meta.env.STORYBLOK_TOKEN,
    resolve_relations: 'partie.modules,module.cours',
  });
  return data.story as StoryblokStory;
}

export async function fetchStoriesByComponent(component: string) {
  const api = getStoryblokApi();
  const { data } = await api.get('cdn/stories', {
    version: import.meta.env.IS_PREVIEW === 'true' ? 'draft' : 'published',
    token: import.meta.env.STORYBLOK_TOKEN,
    filter_query: { component: { in: component } },
    resolve_relations: 'partie.modules,module.cours',
  });
  return data.stories as StoryblokStory[];
}
