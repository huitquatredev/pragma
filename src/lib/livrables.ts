import type { CoursBlok, StoryblokStory } from './storyblok';

export type FormFieldKind = 'text' | 'number' | 'image';

export interface FormFieldDef {
  key: string;
  kind: FormFieldKind;
  label: string;
  aide?: string;
  placeholder?: string;
  unite?: string;
}

export interface FormSection {
  titre?: string;
  intro?: unknown;
  fields: FormFieldDef[];
}

interface RawBlok {
  component?: string;
  _uid?: string;
  titre?: string;
  intro?: unknown;
  label?: string;
  aide?: string;
  placeholder?: string;
  unite?: string;
  cle?: string;
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'champ'
  );
}

/** Stable payload key: explicit `cle` wins, else slugified label (deduped). */
function fieldKey(raw: RawBlok, label: string, seen: Map<string, number>): string {
  const base =
    typeof raw.cle === 'string' && raw.cle.trim().length > 0
      ? slugify(raw.cle)
      : slugify(label);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function kindOf(component: string): FormFieldKind | 'section' | null {
  const c = component.toLowerCase();
  if (c.includes('section') || c.includes('bloc') || c.includes('intro')) return 'section';
  if (c.includes('number') || c.includes('nombre')) return 'number';
  if (c.includes('image') || c.includes('fichier') || c.includes('capture')) return 'image';
  if (c.includes('text') || c.includes('texte') || c.includes('field') || c.includes('champ'))
    return 'text';
  return null;
}

/**
 * Normalize `bloc_action.form_fields` (Blocks) into sections + fields.
 * Tolerant to component naming: matches on substrings so editors stay free.
 */
export function parseFormFields(bloks: unknown): FormSection[] {
  if (!Array.isArray(bloks)) return [];
  const sections: FormSection[] = [];
  const seen = new Map<string, number>();
  const current = (): FormSection => {
    if (sections.length === 0) sections.push({ fields: [] });
    return sections[sections.length - 1];
  };

  for (const item of bloks as RawBlok[]) {
    if (!item || typeof item !== 'object') continue;
    const kind = kindOf(String(item.component ?? ''));
    if (kind === 'section') {
      // A section blok with fields nested inside (future-proof) or a pure intro.
      const nested = (item as Record<string, unknown>).fields;
      if (Array.isArray(nested)) {
        const section: FormSection = { titre: item.titre, intro: item.intro, fields: [] };
        sections.push(section);
        for (const n of nested as RawBlok[]) {
          const nk = kindOf(String(n.component ?? ''));
          if (nk === 'text' || nk === 'number' || nk === 'image') {
            const label = String(n.label ?? '').trim();
            if (!label) continue;
            section.fields.push({
              key: fieldKey(n, label, seen),
              kind: nk,
              label,
              aide: typeof n.aide === 'string' ? n.aide : undefined,
              placeholder: typeof n.placeholder === 'string' ? n.placeholder : undefined,
              unite: typeof n.unite === 'string' ? n.unite : undefined,
            });
          }
        }
      } else {
        sections.push({ titre: item.titre, intro: item.intro, fields: [] });
      }
      continue;
    }
    if (kind === 'text' || kind === 'number' || kind === 'image') {
      const label = String(item.label ?? '').trim();
      if (!label) continue;
      current().fields.push({
        key: fieldKey(item, label, seen),
        kind,
        label,
        aide: typeof item.aide === 'string' ? item.aide : undefined,
        placeholder: typeof item.placeholder === 'string' ? item.placeholder : undefined,
        unite: typeof item.unite === 'string' ? item.unite : undefined,
      });
    }
  }
  return sections.filter((s) => s.fields.length > 0 || s.titre || s.intro);
}

export function allFormFields(sections: FormSection[]): FormFieldDef[] {
  return sections.flatMap((s) => s.fields);
}

/** Merge every bloc_action of a cours (normally one) into a single form definition. */
export function getCoursForm(course: StoryblokStory): FormSection[] {
  const body = (course.content.body as CoursBlok[] | undefined) ?? [];
  const merged: unknown[] = [];
  for (const section of body) {
    if (
      section &&
      typeof section === 'object' &&
      (section as { component?: string }).component === 'bloc_action'
    ) {
      const fields = (section as Record<string, unknown>).form_fields;
      if (Array.isArray(fields)) merged.push(...fields);
    }
  }
  return parseFormFields(merged);
}

export function hasForm(sections: FormSection[]): boolean {
  return allFormFields(sections).length > 0;
}

export function isFieldFilled(kind: FormFieldKind, value: unknown): boolean {
  if (kind === 'number') {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const t = value.trim();
    return t.length > 0 && Number.isFinite(Number(t));
  }
  return typeof value === 'string' && value.trim().length > 0;
}

/** Keys of required fields (all fields are required on the livrable page) left empty. */
export function missingFieldKeys(
  sections: FormSection[],
  payload: Record<string, unknown>
): string[] {
  return allFormFields(sections)
    .filter((f) => !isFieldFilled(f.kind, payload[f.key]))
    .map((f) => f.key);
}

export type AnswersByCours = Record<string, Record<string, unknown>>;

export function livrableMissingCount(
  formsByCours: Record<string, FormSection[]>,
  answers: AnswersByCours
): { missing: number; total: number } {
  let missing = 0;
  let total = 0;
  for (const [coursId, sections] of Object.entries(formsByCours)) {
    for (const f of allFormFields(sections)) {
      total += 1;
      if (!isFieldFilled(f.kind, answers[coursId]?.[f.key])) missing += 1;
    }
  }
  return { missing, total };
}
