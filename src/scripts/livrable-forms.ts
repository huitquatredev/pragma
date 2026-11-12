import { evaluateDisplays } from '../lib/livrables';

/**
 * Progressive enhancement for every `form.livrable-form` on the page
 * (cours pages and dashboard livrable pages).
 *
 * This file is bundled ONCE by Vite (imported from AppLayout), so it may
 * freely import from src/lib. Per-form data comes from DOM + data-attrs
 * (no `define:vars`: those scripts are inlined raw and must stay
 * import-free).
 */

function savedPayload(form: HTMLFormElement): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(form.dataset.saved || '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Values from earlier cours (including their computed displays). */
function baseValues(form: HTMLFormElement): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(form.dataset.baseValues || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string') values[key] = value;
      else if (typeof value === 'number') values[key] = String(value);
    }
    return values;
  } catch {
    return {};
  }
}

function namedInputs(form: HTMLFormElement): (HTMLInputElement | HTMLTextAreaElement)[] {
  return [...form.querySelectorAll('[name]')].filter(
    (el): el is HTMLInputElement | HTMLTextAreaElement =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
  );
}

function enhanceForm(form: HTMLFormElement) {
  if (form.dataset.enhanced === 'true') return;
  form.dataset.enhanced = 'true';

  const status = form.querySelector('.livrable-status');
  const setStatus = (msg: string, isError = false) => {
    if (!status) return;
    status.textContent = msg;
    status.setAttribute('data-error', isError ? 'true' : 'false');
  };

  // Prefill textareas from saved answers (done in JS so markup whitespace
  // can never leak into values; number/url/hidden/range use value attrs).
  const saved = savedPayload(form);
  for (const el of form.querySelectorAll('textarea[name]')) {
    if (!(el instanceof HTMLTextAreaElement)) continue;
    const value = saved[el.getAttribute('name') ?? ''];
    if (typeof value === 'string' || typeof value === 'number') el.value = String(value);
  }

  // Live values of this form (textareas, numbers, sliders, urls, images),
  // seeded with earlier-cours values so cross-cours formulas resolve.
  const base = baseValues(form);
  const scopeValues = (): Record<string, string> => {
    const values: Record<string, string> = { ...base };
    for (const el of namedInputs(form)) {
      if (el instanceof HTMLInputElement && el.type === 'file') continue;
      const key = el.getAttribute('name');
      if (key) values[key] = el.value;
    }
    return values;
  };

  // Recompute calculated results, feeding computed displays back in so
  // chained formulas (display -> display) resolve. Same-cours values only;
  // cross-cours refs resolve on the livrable page where answers are merged.
  const refreshDisplays = () => {
    const values = scopeValues();
    const defs = [...form.querySelectorAll('[data-formula]')].map((el) => ({
      key: (el as HTMLElement).dataset.displayKey ?? '',
      formula: (el as HTMLElement).dataset.formula ?? '',
    }));
    const computed = evaluateDisplays(defs, values);
    form.querySelectorAll('[data-formula]').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const out = el.querySelector('[data-display-value]');
      if (out) out.textContent = computed[el.dataset.displayKey ?? ''] ?? '—';
    });
  };

  // Slider bubbles.
  for (const input of form.querySelectorAll('input[type="range"][name]')) {
    if (!(input instanceof HTMLInputElement)) continue;
    const bubble = input.id ? document.getElementById(`${input.id}-val`) : null;
    const sync = () => {
      if (bubble) bubble.textContent = input.value;
    };
    input.addEventListener('input', sync);
    sync();
  }

  form.addEventListener('input', refreshDisplays);
  refreshDisplays();

  // Immediate upload of captures to Supabase Storage (bucket livrable-images).
  for (const input of form.querySelectorAll('input[type="file"][data-image-input]')) {
    if (!(input instanceof HTMLInputElement)) continue;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const key = input.getAttribute('data-image-input') ?? '';
      const hidden = key
        ? form.querySelector(`input[type="hidden"][name="${CSS.escape(key)}"]`)
        : null;
      setStatus('Envoi de l’image…');
      try {
        const body = new FormData();
        body.append('file', file);
        body.append('cours_id', form.dataset.coursId ?? '');
        const res = await fetch('/api/livrable_upload', { method: 'POST', body });
        const json: { url?: string; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Échec de l’envoi de l’image.');
        if (hidden instanceof HTMLInputElement && json.url) hidden.value = json.url;
        setStatus('Image envoyée — pensez à Enregistrer.');
        window.dispatchEvent(new Event('livrable:update'));
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'Échec de l’envoi.', true);
      }
    });
  }

  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm('Supprimer vos réponses pour ce cours ?')) return;
    setStatus('Suppression…');
    try {
      const res = await fetch(
        `/api/form_answers?cours_id=${encodeURIComponent(form.dataset.coursId ?? '')}`,
        { method: 'DELETE' }
      );
      const json: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Échec de la suppression.');
      for (const el of form.querySelectorAll(
        'textarea, input[type="number"], input[type="url"], input[type="range"], input[type="hidden"]'
      )) {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = '';
      }
      for (const el of form.querySelectorAll('input[type="file"]')) {
        if (el instanceof HTMLInputElement) el.value = '';
      }
      setStatus('Réponses supprimées.');
      form.dataset.saved = '{}';
      window.dispatchEvent(new Event('livrable:update'));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Échec de la suppression.', true);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Enregistrement…');
    const payload: Record<string, string> = {};
    for (const el of form.querySelectorAll(
      'textarea[name], input[type="number"][name], input[type="url"][name], input[type="range"][name], input[type="hidden"][name]'
    )) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) continue;
      const name = el.getAttribute('name');
      if (!name) continue;
      // Trim text edges: indentation/newlines must never be stored as content.
      payload[name] = el instanceof HTMLTextAreaElement ? el.value.trim() : el.value;
    }
    try {
      const res = await fetch('/api/form_answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cours_id: form.dataset.coursId,
          partie_id: form.dataset.partieId,
          payload,
        }),
      });
      const json: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Échec de l’enregistrement.');
      setStatus('Enregistré.');
      form.dataset.saved = JSON.stringify(payload);
      window.dispatchEvent(new Event('livrable:update'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Échec de l’enregistrement.', true);
    }
  });
}

function init() {
  document
    .querySelectorAll<HTMLFormElement>('form.livrable-form')
    .forEach((form) => enhanceForm(form));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
