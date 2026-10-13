import type { CoursBlok, StoryblokStory } from './storyblok';

export type FormFieldKind = 'text' | 'number' | 'image' | 'display';

export interface FormFieldDef {
  key: string;
  kind: FormFieldKind;
  label: string;
  aide?: string;
  placeholder?: string;
  unite?: string;
  /** text: 'url' renders a single-line link input. */
  format?: string;
  /** number extras */
  entier?: boolean;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** display: formula over field keys, e.g. `field1+field2`, `if(a>=b) then "OK" else "KO"`. */
  formula?: string;
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
  format?: string;
  entier?: boolean;
  min?: number | string;
  max?: number | string;
  min_label?: string;
  max_label?: string;
  display?: string;
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
    typeof raw.cle === 'string' && raw.cle.trim().length > 0 ? slugify(raw.cle) : slugify(label);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function toOptNumber(raw: number | string | undefined): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function kindOf(component: string): FormFieldKind | 'section' | null {
  const c = component.toLowerCase();
  if (c.includes('section') || c.includes('bloc') || c.includes('intro')) return 'section';
  if (c.includes('display') || c.includes('calcul') || c.includes('resultat')) return 'display';
  if (c.includes('number') || c.includes('nombre') || c.includes('integer')) return 'number';
  if (c.includes('image') || c.includes('fichier') || c.includes('capture')) return 'image';
  if (
    c.includes('text') ||
    c.includes('texte') ||
    c.includes('field') ||
    c.includes('champ') ||
    c.includes('choice')
  )
    return 'text';
  return null;
}

function buildField(
  raw: RawBlok,
  kind: FormFieldKind,
  seen: Map<string, number>
): FormFieldDef | null {
  const label = String(raw.label ?? '').trim();
  if (!label) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  return {
    key: fieldKey(raw, label, seen),
    kind,
    label,
    aide: str(raw.aide),
    placeholder: str(raw.placeholder),
    unite: str(raw.unite),
    format: str(raw.format)?.toLowerCase(),
    entier: raw.entier === true,
    min: toOptNumber(raw.min),
    max: toOptNumber(raw.max),
    minLabel: str(raw.min_label),
    maxLabel: str(raw.max_label),
    formula: str(raw.display),
  };
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
          if (nk === 'text' || nk === 'number' || nk === 'image' || nk === 'display') {
            const f = buildField(n, nk, seen);
            if (f) section.fields.push(f);
          }
        }
      } else {
        sections.push({ titre: item.titre, intro: item.intro, fields: [] });
      }
      continue;
    }
    if (kind === 'text' || kind === 'number' || kind === 'image' || kind === 'display') {
      const f = buildField(item, kind, seen);
      if (f) current().fields.push(f);
    }
  }
  return sections.filter((s) => s.fields.length > 0 || s.titre || s.intro);
}

export function allFormFields(sections: FormSection[]): FormFieldDef[] {
  return sections.flatMap((s) => s.fields);
}

/** Only fillable inputs — displays are computed, never required. */
export function inputFields(sections: FormSection[]): FormFieldDef[] {
  return allFormFields(sections).filter((f) => f.kind !== 'display');
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
  if (kind === 'display') return true;
  if (kind === 'number') {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const t = value.trim().replace(',', '.');
    return t.length > 0 && Number.isFinite(Number(t));
  }
  return typeof value === 'string' && value.trim().length > 0;
}

/** Keys of required INPUT fields left empty (displays excluded). */
export function missingFieldKeys(
  sections: FormSection[],
  payload: Record<string, unknown>
): string[] {
  return inputFields(sections)
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
    for (const f of inputFields(sections)) {
      total += 1;
      if (!isFieldFilled(f.kind, answers[coursId]?.[f.key])) missing += 1;
    }
  }
  return { missing, total };
}

// ---------------------------------------------------------------------------
// Formula engine for `display` fields.
// Supports: refs (field1), numbers, + - * / ( ), comparisons, AND/OR,
// `if(cond) then a else b` with "..." literals, and `...` ranges
// (field1+...+field9 = sum of field1..field9).
// Any missing/non-numeric ref or division by zero => null (renders "—").
// ---------------------------------------------------------------------------

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'op'; v: string }
  | { t: 'range' }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'kw'; v: 'IF' | 'THEN' | 'ELSE' | 'AND' | 'OR' };

const KEYWORDS = new Set(['IF', 'THEN', 'ELSE', 'AND', 'OR']);

function tokenize(formula: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  const s = formula;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (s.startsWith('...', i)) {
      toks.push({ t: 'range' });
      i += 3;
      continue;
    }
    if (ch === '(') {
      toks.push({ t: 'lp' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      toks.push({ t: 'rp' });
      i += 1;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (['>=', '<=', '!=', '=='].includes(two)) {
      toks.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/><='.includes(ch)) {
      toks.push({ t: 'op', v: ch });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = s.indexOf(ch, i + 1);
      if (end < 0) return null;
      toks.push({ t: 'str', v: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^[0-9]+(\.[0-9]+)?/.exec(s.slice(i));
    if (num) {
      toks.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (word) {
      const upper = word[0].toUpperCase();
      if (KEYWORDS.has(upper))
        toks.push({ t: 'kw', v: upper as 'IF' | 'THEN' | 'ELSE' | 'AND' | 'OR' });
      else toks.push({ t: 'ref', v: word[0] });
      i += word[0].length;
      continue;
    }
    return null;
  }
  return toks;
}

type Val = number | string | boolean | null;

class FormulaParser {
  private pos = 0;
  private toks: Tok[];
  private nums: Map<string, number>;
  constructor(toks: Tok[], nums: Map<string, number>) {
    this.toks = toks;
    this.nums = nums;
  }

  parse(): Val {
    const v = this.parseIf();
    return this.pos === this.toks.length ? v : null;
  }

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }

  private parseIf(): Val {
    if (this.peek()?.t === 'kw' && (this.peek() as { v: string }).v === 'IF') {
      this.pos += 1;
      const lp = this.peek();
      if (lp?.t !== 'lp') return null;
      // Find matching ')' accounting for nesting, then expect THEN/ELSE.
      let depth = 0;
      let end = -1;
      for (let j = this.pos; j < this.toks.length; j += 1) {
        if (this.toks[j].t === 'lp') depth += 1;
        if (this.toks[j].t === 'rp') {
          depth -= 1;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end < 0) return null;
      const condToks = this.toks.slice(this.pos + 1, end);
      const sub = new FormulaParser(condToks, this.nums);
      const cond = sub.parse();
      if (sub.pos !== condToks.length || typeof cond !== 'boolean') return null;
      this.pos = end + 1;
      const thenKw = this.peek();
      if (thenKw?.t !== 'kw' || (thenKw as { v: string }).v !== 'THEN') return null;
      this.pos += 1;
      const thenVal = this.parseBranch();
      if (thenVal === undefined) return null;
      const elseKw = this.peek();
      if (elseKw?.t !== 'kw' || (elseKw as { v: string }).v !== 'ELSE') return null;
      this.pos += 1;
      const elseVal = this.parseBranch();
      if (elseVal === undefined) return null;
      if (typeof thenVal !== typeof elseVal) return null;
      return cond ? thenVal : elseVal;
    }
    return this.parseOr();
  }

  private parseBranch(): Val | undefined {
    const t = this.peek();
    if (!t) return undefined;
    if (t.t === 'str') {
      this.pos += 1;
      return t.v;
    }
    const v = this.parseOr();
    return typeof v === 'number' ? v : undefined;
  }

  private parseOr(): Val {
    let left = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'kw' && (t as { v: string }).v === 'OR') {
        this.pos += 1;
        const right = this.parseAnd();
        if (typeof left !== 'boolean' || typeof right !== 'boolean') return null;
        left = left || right;
      } else return left;
    }
  }

  private parseAnd(): Val {
    let left = this.parseCmp();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'kw' && (t as { v: string }).v === 'AND') {
        this.pos += 1;
        const right = this.parseCmp();
        if (typeof left !== 'boolean' || typeof right !== 'boolean') return null;
        left = left && right;
      } else return left;
    }
  }

  private parseCmp(): Val {
    const left = this.parseAdd();
    const t = this.peek();
    if (t?.t === 'op' && ['>=', '<=', '!=', '==', '=', '>', '<'].includes(t.v)) {
      this.pos += 1;
      const right = this.parseAdd();
      if (typeof left === 'string' || typeof right === 'string') {
        if (t.v === '=' || t.v === '==') return left === right;
        if (t.v === '!=') return left !== right;
        return null;
      }
      if (typeof left !== 'number' || typeof right !== 'number') return null;
      switch (t.v) {
        case '>=':
          return left >= right;
        case '<=':
          return left <= right;
        case '>':
          return left > right;
        case '<':
          return left < right;
        case '=':
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        default:
          return null;
      }
    }
    return left;
  }

  private parseAdd(): Val {
    let result = this.parseMul();
    let prevRef: string | null = this.lastWasBareRef ? this.lastRef : null;
    for (;;) {
      const t = this.peek();
      let sign = 0;
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        sign = t.v === '+' ? 1 : -1;
        this.pos += 1;
      } else if (t?.t === 'range') {
        // Bare `...` (no explicit operator): continuation with '+'.
        sign = 1;
      } else {
        return result;
      }
      if (this.peek()?.t === 'range') {
        // `prevRef +...+ nextRef`: sum of (prevRef+1)..nextRef.
        this.pos += 1;
        const plus = this.peek();
        if (plus?.t !== 'op' || plus.v !== '+') return null;
        this.pos += 1;
        const next = this.parseMul();
        if (prevRef === null || typeof next !== 'number' || !this.lastWasBareRef) return null;
        const expanded = expandRange(prevRef, this.lastRef, this.nums);
        if (expanded === null || typeof result !== 'number') return null;
        result = result + sign * expanded;
        prevRef = this.lastRef;
        continue;
      }
      const right = this.parseMul();
      if (typeof result !== 'number' || typeof right !== 'number') return null;
      result = sign === 1 ? result + right : result - right;
      prevRef = this.lastWasBareRef ? this.lastRef : null;
    }
  }

  private lastWasBareRef = false;
  private lastRef = '';

  private parseMul(): Val {
    let result = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.pos += 1;
        const right = this.parseUnary();
        if (typeof result !== 'number' || typeof right !== 'number') return null;
        if (t.v === '/' && right === 0) return null;
        result = t.v === '*' ? result * right : result / right;
        this.lastWasBareRef = false;
        continue;
      }
      return result;
    }
  }

  private parseUnary(): Val {
    const t = this.peek();
    if (t?.t === 'op' && t.v === '-') {
      this.pos += 1;
      const v = this.parseUnary();
      this.lastWasBareRef = false;
      return typeof v === 'number' ? -v : null;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Val {
    const t = this.peek();
    if (!t) return null;
    if (t.t === 'num') {
      this.pos += 1;
      this.lastWasBareRef = false;
      return t.v;
    }
    if (t.t === 'str') {
      this.pos += 1;
      this.lastWasBareRef = false;
      return t.v;
    }
    if (t.t === 'ref') {
      this.pos += 1;
      const v = this.nums.get(t.v);
      this.lastWasBareRef = true;
      this.lastRef = t.v;
      return v ?? null;
    }
    if (t.t === 'lp') {
      this.pos += 1;
      this.lastWasBareRef = false;
      const v = this.parseOr();
      if (this.peek()?.t !== 'rp') return null;
      this.pos += 1;
      return v;
    }
    return null;
  }
}

/** Expand `field2+...+field9` (exclusive lower, inclusive upper). */
function expandRange(from: string, to: string, nums: Map<string, number>): number | null {
  const m1 = /^([A-Za-z_]+)(\d+)$/.exec(from);
  const m2 = /^([A-Za-z_]+)(\d+)$/.exec(to);
  if (!m1 || !m2 || m1[1] !== m2[1]) return null;
  const start = Number(m1[2]) + 1;
  const end = Number(m2[2]);
  if (end < start) return null;
  let sum = 0;
  for (let n = start; n <= end; n += 1) {
    const v = nums.get(`${m1[1]}${n}`);
    if (v === undefined) return null;
    sum += v;
  }
  return sum;
}

function toNumber(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const t = value.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Ordered unique field refs in a formula (`a+...+b` ranges expanded, inclusive). */
export function extractFormulaRefs(formula: string): string[] {
  const refs: string[] = [];
  const push = (r: string) => {
    if (!refs.includes(r)) refs.push(r);
  };
  // Strip string literals so their content is never read as refs.
  const noStrings = formula.replace(/"[^"]*"|'[^']*'/g, '""');
  // Expand `refA+...+refB` ranges first.
  const noRanges = noStrings.replace(
    /([A-Za-z_]\w*)\s*\+\s*\.\.\.\s*\+\s*([A-Za-z_]\w*)/g,
    (_m, a: string, b: string) => {
      const m1 = /^([A-Za-z_]+)(\d+)$/.exec(a);
      const m2 = /^([A-Za-z_]+)(\d+)$/.exec(b);
      if (m1 && m2 && m1[1] === m2[1]) {
        for (let n = Number(m1[2]); n <= Number(m2[2]); n += 1) push(`${m1[1]}${n}`);
      } else {
        push(a);
        push(b);
      }
      return ' ';
    }
  );
  for (const t of tokenize(noRanges) ?? []) {
    if (t.t === 'ref') push(t.v);
  }
  return refs;
}

/**
 * Evaluate a display formula. Returns number|string, or null when any ref is
 * missing/non-numeric or the formula is invalid (renders "—").
 */
export function evaluateFormula(
  formula: string,
  values: Record<string, string | number | undefined>
): number | string | null {
  const toks = tokenize(formula);
  if (!toks || toks.length === 0) return null;
  const refs = extractFormulaRefs(formula);
  const nums = new Map<string, number>();
  for (const r of refs) {
    const n = toNumber(values[r]);
    if (n === null) return null;
    nums.set(r, n);
  }
  const parser = new FormulaParser(toks, nums);
  const result = parser.parse();
  if (typeof result === 'boolean') return null;
  return result;
}

/** Display-ready value: numbers rounded to 2 decimals, trailing zeros stripped. */
export function formatFormulaValue(value: number | string): string {
  if (typeof value === 'string') return value;
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * Evaluate every display in order (multi-pass so chained and cross-cours
 * displays resolve). Returns key -> formatted string for computable displays.
 */
export function evaluateDisplays(
  defs: { key: string; formula: string }[],
  base: Record<string, string | number | undefined>
): Record<string, string> {
  const values: Record<string, string | number | undefined> = { ...base };
  const done = new Map<string, number | string>();
  for (let pass = 0; pass < defs.length + 2; pass += 1) {
    let progressed = false;
    for (const def of defs) {
      if (done.has(def.key)) continue;
      const v = evaluateFormula(def.formula, values);
      if (v !== null) {
        done.set(def.key, v);
        values[def.key] = typeof v === 'number' ? v : undefined;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return Object.fromEntries([...done.entries()].map(([k, v]) => [k, formatFormulaValue(v)]));
}

/** Merge per-cours answers in partie order (later cours win on key collisions). */
export function mergePartieAnswers(
  coursIdsInOrder: string[],
  answers: AnswersByCours
): Record<string, string | number | undefined> {
  const merged: Record<string, string | number | undefined> = {};
  for (const id of coursIdsInOrder) {
    for (const [k, v] of Object.entries(answers[id] ?? {})) {
      if (typeof v === 'string' || typeof v === 'number') merged[k] = v;
    }
  }
  return merged;
}
