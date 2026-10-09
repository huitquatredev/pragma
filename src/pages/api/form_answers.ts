import type { APIRoute } from 'astro';

const MAX_KEYS = 200;
const MAX_VALUE_CHARS = 100_000;
const MAX_TOTAL_CHARS = 1_000_000;

function cleanPayload(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_KEYS) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 80) return null;
    if (typeof value !== 'string') return null;
    if (value.length > MAX_VALUE_CHARS) return null;
    out[key] = value;
  }
  if (JSON.stringify(out).length > MAX_TOTAL_CHARS) return null;
  return out;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = context.locals.supabase;
  if (!user || !supabase) {
    return new Response(JSON.stringify({ error: 'Connectez-vous pour enregistrer.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let body: { cours_id?: unknown; partie_id?: unknown; payload?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const coursId = typeof body.cours_id === 'string' ? body.cours_id.trim() : '';
  const partieId = typeof body.partie_id === 'string' ? body.partie_id.trim() : '';
  const payload = cleanPayload(body.payload);
  if (!coursId || coursId.length > 200 || partieId.length > 200 || payload === null) {
    return new Response(JSON.stringify({ error: 'Données invalides.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { error } = await supabase.from('form_answers').upsert({
    user_id: user.id,
    cours_id: coursId,
    partie_id: partieId,
    payload,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[form_answers] upsert error:', error.message);
    return new Response(JSON.stringify({ error: 'Échec de l’enregistrement.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = context.locals.supabase;
  if (!user || !supabase) {
    return new Response(JSON.stringify({ error: 'Connectez-vous pour supprimer.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const coursId = context.url.searchParams.get('cours_id')?.trim() ?? '';
  if (!coursId || coursId.length > 200) {
    return new Response(JSON.stringify({ error: 'cours_id manquant.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { error } = await supabase
    .from('form_answers')
    .delete()
    .eq('user_id', user.id)
    .eq('cours_id', coursId);
  if (error) {
    console.error('[form_answers] delete error:', error.message);
    return new Response(JSON.stringify({ error: 'Échec de la suppression.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
