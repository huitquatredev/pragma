/**
 * Normalisation d'affichage des titres.
 * Les titres Storyblok embarquent parfois leur niveau ("Module 3 : …",
 * "Module 2 - …", "Partie 1 : …") de façon incohérente. On affiche le titre
 * nu et on construit le niveau (PARTIE 2, MODULE 3) côté front, en 1-based.
 * Le CMS n'est pas modifié (slugs et données intacts).
 */

const LEVEL_PREFIX = /^(partie|module)\s+\d+\s*[:\-–—]?\s*/i;

/** "Module 3 : Prépare…" -> "Prépare…" ; "Décrypte…" inchangé. */
export function stripLevelPrefix(title: string | undefined | null): string {
  if (typeof title !== 'string') return '';
  return title.replace(LEVEL_PREFIX, '').trim() || title.trim();
}

/** Index 0-based -> numéro 1-based, -1 (introuvable) -> null. */
export function oneBased(index: number): number | null {
  return index >= 0 ? index + 1 : null;
}
