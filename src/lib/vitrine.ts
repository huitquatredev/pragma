export interface StoryblokLink {
  url?: string;
  cached_url?: string;
  linktype?: string;
}

/** Resolve a Storyblok multilink into a usable href. */
export function linkHref(link?: StoryblokLink | null): string {
  if (!link) return '';
  const raw = (link.cached_url || link.url || '').trim();
  if (!raw) return '';
  if (link.linktype === 'email' && !raw.startsWith('mailto:')) return `mailto:${raw}`;
  if (raw.startsWith('#') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return `/${raw}`;
}

/** One item per non-empty line (textarea lists in Storyblok). */
export function lines(value?: string | null): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Tags stored one per line, normalised for display. */
export function tagList(value?: string | null): string[] {
  return lines(value).map((tag) => tag.replace(/\s+/g, ' '));
}
