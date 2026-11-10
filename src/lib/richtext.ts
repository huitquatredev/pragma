/**
 * Helpers richtext Storyblok.
 * Les contenus importés commencent souvent par la ligne-marqueur du fichier
 * source (« 🎯 L'Enjeu : Pourquoi cette étape est vitale pour toi »,
 * « 🧠 Ce qu'il faut comprendre : … », « 🚀 À toi de jouer : … »).
 * Comme l'UI affiche déjà le titre du bloc, ces lignes feraient doublon :
 * on les retire au rendu (le payload importé reste intact).
 */

interface TextNode {
  text?: string;
}

interface BlockNode {
  type?: string;
  content?: TextNode[];
}

interface RichDoc {
  type?: string;
  content?: BlockNode[];
}

const LEAD_MARKERS = [
  "l'enjeu",
  'l’enjeu',
  "ce qu'il faut comprendre",
  'ce qu’il faut comprendre',
  'a toi de jouer',
  'à toi de jouer',
  'evaluation flash',
  'évaluation flash',
  'guide pas a pas',
  'guide pas à pas',
  "l'application par l'exemple",
  'l’application par l’exemple',
];

const INLINE_LABELS = /^(enjeu|approche|résultat|resultat|outils?|prérequis|prerequis)\s*:\s*/i;

function plainText(block?: BlockNode): string {
  if (!block || !Array.isArray(block.content)) return '';
  return block.content.map((n) => n?.text ?? '').join('');
}

function normalized(text: string): string {
  return text
    .replace(/^[^\p{L}]+/u, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isDoc(doc: unknown): doc is RichDoc {
  const d = doc as RichDoc;
  return !!d && d.type === 'doc' && Array.isArray(d.content);
}

function paragraphsToDoc(paragraphs: string[]): RichDoc {
  return {
    type: 'doc',
    content: paragraphs
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p) => p.length > 0)
      .map((p) => ({ type: 'paragraph', content: [{ text: p }] })),
  };
}

/**
 * Coerce loose values into a real doc. Some seeded `form_section.intro`
 * are plain string arrays instead of Storyblok docs — render them as
 * paragraphs instead of crashing the resolver.
 */
function coerceToDoc(doc: unknown): unknown {
  if (typeof doc === 'string') return paragraphsToDoc([doc]);
  if (Array.isArray(doc)) {
    if (doc.length > 0 && doc.every((item) => typeof item === 'string')) {
      return paragraphsToDoc(doc as string[]);
    }
    if (doc.length > 0 && doc.every((item) => item && typeof item === 'object')) {
      return { type: 'doc', content: doc };
    }
    return { type: 'doc', content: [] };
  }
  return doc;
}

/** Retire le 1er paragraphe s'il n'est que la ligne-marqueur du fichier source. */
export function withoutLeadMarker(doc: unknown): unknown {
  if (!isDoc(doc) || doc.content!.length === 0) return doc;
  const first = doc.content![0];
  if (first.type !== 'paragraph') return doc;
  const text = plainText(first);
  if (text.length > 160) return doc;
  if (!LEAD_MARKERS.some((m) => normalized(text).startsWith(m))) return doc;
  return { ...doc, content: doc.content!.slice(1) };
}

/** Retire un label inline (« Enjeu : … », « Approche : … ») en tête du 1er paragraphe. */
export function withoutInlineLabel(doc: unknown): unknown {
  if (!isDoc(doc) || doc.content!.length === 0) return doc;
  const first = doc.content![0];
  if (first.type !== 'paragraph' || !Array.isArray(first.content) || first.content.length === 0) {
    return doc;
  }
  const head = first.content[0];
  const raw = head.text ?? '';
  const stripped = raw.replace(/^[^\p{L}]+/u, '').replace(INLINE_LABELS, '');
  if (stripped === raw || stripped.trim().length === 0) return doc;
  const leadingEmoji = raw.slice(0, raw.length - raw.replace(/^[^\p{L}]+/u, '').length);
  return {
    ...doc,
    content: [
      { ...first, content: [{ ...head, text: `${leadingEmoji}${stripped}` }] },
      ...doc.content!.slice(1),
    ],
  };
}

/** Combinaison : marqueur pleine ligne puis label inline. */
export function cleanRichText(doc: unknown): unknown {
  return withoutInlineLabel(withoutLeadMarker(coerceToDoc(doc)));
}

/**
 * Remplace un marqueur (ex. « @score ») dans toutes les chaînes d'un doc
 * richtext — texte, liens et autres attributs.
 */
export function replaceRichTextToken(doc: unknown, token: string, value: string): unknown {
  if (typeof doc === 'string') return doc.split(token).join(value);
  if (Array.isArray(doc)) return doc.map((item) => replaceRichTextToken(item, token, value));
  if (doc && typeof doc === 'object') {
    return Object.fromEntries(
      Object.entries(doc as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceRichTextToken(item, token, value),
      ])
    );
  }
  return doc;
}

/** Vrai si le doc richtext contient du texte visible (récursif : paragraphes, listes, etc.). */
export function hasRichText(doc: unknown): boolean {
  if (!doc) return false;
  if (typeof doc === 'string') return doc.trim().length > 0;
  const seen = new Set<unknown>();
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node === 'string') {
      if (node.trim().length > 0) return true;
      continue;
    }
    if (node && typeof node === 'object') {
      if (seen.has(node)) continue;
      seen.add(node);
      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string' && record.text.trim().length > 0) return true;
      for (const value of Object.values(record)) {
        if (Array.isArray(value)) stack.push(...value);
        else if (value && typeof value === 'object') stack.push(value);
      }
    }
  }
  return false;
}
