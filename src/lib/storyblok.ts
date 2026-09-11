import { useStoryblokApi } from '@storyblok/astro';

const isPreview = () => process.env.IS_PREVIEW === 'true' || import.meta.env.IS_PREVIEW === 'true';

export interface StoryblokStory {
  uuid: string;
  slug: string;
  full_slug: string;
  content: {
    component: string;
    title?: string;
    titre?: string;
    body?: unknown;
    description?: string;
    robots?: string;
    schema?: unknown;
    ogImage?: { filename: string; alt?: string };
    ogImageAlt?: string;
    canonical?: { url: string };
    modules?: StoryblokStory[];
    cours?: StoryblokStory[];
    upgrade?: boolean;
    option_camille?: boolean;
  };
}

export interface SectionText {
  component: string;
  titre?: string;
  corps?: unknown;
  bouton_text?: string;
  bouton_lien?: { url: string; linktype?: string };
}

export function getStoryblokApi() {
  return useStoryblokApi();
}

export async function fetchStory(slug: string) {
  const api = getStoryblokApi();
  const opts = {
    version: (isPreview() ? 'draft' : 'published') as
      | 'draft'
      | 'published',
    token: import.meta.env.STORYBLOK_TOKEN,
    resolve_relations: 'partie.modules,module.cours',
  };

  // Try direct path first (works when slug matches full_slug)
  try {
    const { data } = await api.get(`cdn/stories/${slug}`, opts);
    return data.story as StoryblokStory;
  } catch {
    // not found by path, continue
  }

  // Try by_slugs
  const { data } = await api.get('cdn/stories', { ...opts, by_slugs: slug });
  const stories = data.stories as StoryblokStory[];
  if (stories.length) return stories[0];

  // Fallback: search all stories by full_slug or slug ending
  const { data: all } = await api.get('cdn/stories', { ...opts, per_page: 100 });
  const allStories = all.stories as StoryblokStory[];
  const match =
    allStories.find((s) => s.full_slug === slug) ||
    allStories.find((s) => s.slug === slug) ||
    allStories.find((s) => s.full_slug.endsWith(`/${slug}`));
  if (match) {
    // Re-fetch by full_slug to get resolved relations
    try {
      const { data } = await api.get(`cdn/stories/${match.full_slug}`, opts);
      return data.story as StoryblokStory;
    } catch {
      return match;
    }
  }

  throw new Error(`Story not found: ${slug}`);
}

export async function fetchStoriesByComponent(component: string) {
  const api = getStoryblokApi();
  const { data } = await api.get('cdn/stories', {
    version: isPreview() ? 'draft' : 'published',
    token: import.meta.env.STORYBLOK_TOKEN,
    filter_query: { component: { in: component } },
    resolve_relations: 'partie.modules,module.cours',
  });
  return data.stories as StoryblokStory[];
}

export async function fetchFormationIndex(): Promise<StoryblokStory[]> {
  const api = getStoryblokApi();
  const { data } = await api.get('cdn/stories/parties/index-general', {
    version: isPreview() ? 'draft' : 'published',
    token: import.meta.env.STORYBLOK_TOKEN,
    resolve_relations: 'index.parties_list,partie.modules,module.cours',
  });
  const story = data.story as StoryblokStory;
  return (story.content as Record<string, unknown>).parties_list as StoryblokStory[];
}
