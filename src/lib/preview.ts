/**
 * True on the Storyblok preview deployment (`IS_PREVIEW=true`).
 *
 * Checked at request time first (Vercel sets the variable per environment),
 * with the build-time value as a fallback for local builds.
 */
export function isPreviewDeployment(): boolean {
  const value = process.env.IS_PREVIEW ?? import.meta.env.IS_PREVIEW;
  return value === 'true';
}
