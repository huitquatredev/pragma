import type { APIRoute } from 'astro';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = context.locals.supabase;
  if (!user || !supabase) {
    return new Response(JSON.stringify({ error: 'Connectez-vous pour envoyer une image.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const file = form.get('file');
  const coursId = String(form.get('cours_id') ?? '').trim().slice(0, 200) || 'sans-cours';
  if (!(file instanceof File) || file.size === 0) {
    return new Response(JSON.stringify({ error: 'Aucun fichier reçu.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!ALLOWED.has(file.type) || file.size > MAX_BYTES) {
    return new Response(
      JSON.stringify({ error: 'Image invalide (JPEG/PNG/WebP, 5 Mo max).' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'capture';
  const path = `${user.id}/${coursId}/${Date.now()}-${safeName}.${ALLOWED.get(file.type)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from('livrable-images')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) {
    console.error('[livrable_upload] error:', error.message);
    return new Response(JSON.stringify({ error: 'Échec de l’envoi de l’image.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { data } = supabase.storage.from('livrable-images').getPublicUrl(path);
  return new Response(JSON.stringify({ ok: true, url: data.publicUrl }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
