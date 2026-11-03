import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Parameters Storyblok appends to the Visual Editor iframe URL. The token is
 * `sha1(space_id:preview_access_token:timestamp)`, documented in
 * https://www.storyblok.com/docs/concepts/visual-editor#verify-the-preview-token
 */
export interface StoryblokPreviewParams {
  spaceId: string;
  timestamp: number;
  token: string;
}

export interface StoryblokPreviewEnv {
  spaceId?: string;
  previewToken?: string;
}

const PREVIEW_MAX_AGE_SECONDS = 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

export function readStoryblokPreviewParams(url: URL): StoryblokPreviewParams | null {
  const spaceId = url.searchParams.get('_storyblok_tk[space_id]');
  const timestamp = Number(url.searchParams.get('_storyblok_tk[timestamp]'));
  const token = url.searchParams.get('_storyblok_tk[token]');

  if (!spaceId || !token || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  return { spaceId, timestamp, token };
}

export function serializePreviewParams(params: StoryblokPreviewParams): string {
  return `${params.spaceId}:${params.timestamp}:${params.token}`;
}

export function parsePreviewCookie(value: string | undefined): StoryblokPreviewParams | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length !== 3) return null;

  const [spaceId, rawTimestamp, token] = parts;
  const timestamp = Number(rawTimestamp);
  if (!spaceId || !token || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  return { spaceId, timestamp, token };
}

export function isStoryblokPreviewRequest(
  params: StoryblokPreviewParams,
  env: StoryblokPreviewEnv
): boolean {
  if (!env.previewToken) return false;
  if (env.spaceId && params.spaceId !== env.spaceId) return false;

  const now = Math.floor(Date.now() / 1000);
  if (params.timestamp <= now - PREVIEW_MAX_AGE_SECONDS) return false;
  if (params.timestamp > now + CLOCK_SKEW_SECONDS) return false;

  const expected = createHash('sha1')
    .update(`${params.spaceId}:${env.previewToken}:${params.timestamp}`)
    .digest();

  const actual = Buffer.from(params.token, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Preview access token from the space (STORYBLOK_TOKEN in .env). */
export function getStoryblokPreviewEnv(): StoryblokPreviewEnv {
  return {
    spaceId: process.env.STORYBLOK_SPACE_ID ?? import.meta.env.STORYBLOK_SPACE_ID ?? undefined,
    previewToken: process.env.STORYBLOK_TOKEN ?? import.meta.env.STORYBLOK_TOKEN ?? undefined,
  };
}
