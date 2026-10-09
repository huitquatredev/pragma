import type { APIRoute } from 'astro';
import { fetchStory, type StoryblokStory } from '../../lib/storyblok';
import { allFormFields, getCoursForm, livrableMissingCount, type AnswersByCours, type FormSection } from '../../lib/livrables';
import { coachEmail, escapeHtml, sendCoachEmail } from '../../lib/email';

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = context.locals.supabase;
  const inscription = context.locals.inscription;
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!user || !supabase) return json({ error: 'Connectez-vous pour envoyer.' }, 401);
  if (!inscription?.correction) {
    return json({ error: 'Votre accès ne comprend pas la correction.' }, 403);
  }

  let slug = '';
  try {
    slug = String((await context.request.json()).partie_slug ?? '').trim();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }
  if (!slug) return json({ error: 'partie_slug manquant.' }, 400);

  const partie = await fetchStory(`parties/${slug}`).catch(() => null);
  if (!partie) return json({ error: 'Partie introuvable.' }, 404);

  // Cours rattachés (modules + directs), puis re-fetch pour le body/form_fields.
  const refs: StoryblokStory[] = [
    ...((partie.content.modules ?? []).flatMap((m) => m.content?.cours ?? [])),
    ...(partie.content.cours ?? []),
  ].filter((c) => c && typeof c === 'object' && c.uuid);
  const stories = await Promise.all(
    refs.map((ref) =>
      fetchStory(ref.full_slug || `cours/${ref.slug}`).catch(() => null)
    )
  );
  const formsByCours: Record<string, FormSection[]> = {};
  const titlesByCours: Record<string, string> = {};
  for (const story of stories) {
    if (!story) continue;
    const sections = getCoursForm(story);
    if (sections.length === 0) continue;
    formsByCours[story.uuid] = sections;
    titlesByCours[story.uuid] = story.content.title ?? story.slug;
  }
  const coursIds = Object.keys(formsByCours);
  if (coursIds.length === 0) {
    return json({ error: 'Aucun formulaire dans cette partie pour le moment.' }, 422);
  }

  const { data: rows } = await supabase
    .from('form_answers')
    .select('cours_id, payload')
    .eq('user_id', user.id)
    .in('cours_id', coursIds);
  const answers: AnswersByCours = {};
  for (const row of (rows as { cours_id: string; payload: Record<string, unknown> }[]) ?? []) {
    answers[row.cours_id] = row.payload ?? {};
  }

  const { missing, total } = livrableMissingCount(formsByCours, answers);
  if (missing > 0) {
    return json(
      { error: `Livrable incomplet : ${missing}/${total} champs vides.`, missing, total },
      422
    );
  }

  const submittedAt = new Date().toISOString();
  const { error } = await supabase.from('livrable_submissions').upsert({
    user_id: user.id,
    partie_id: partie.uuid,
    status: 'submitted',
    submitted_at: submittedAt,
  });
  if (error) {
    console.error('[livrable_submit] upsert error:', error.message);
    return json({ error: 'Échec de l’enregistrement de l’envoi.' }, 500);
  }

  // Email coach avec toutes les données.
  const blocksHtml: string[] = [];
  const blocksText: string[] = [];
  for (const coursId of coursIds) {
    const payload = answers[coursId] ?? {};
    blocksHtml.push(`<h2>${escapeHtml(titlesByCours[coursId])}</h2>`);
    blocksText.push(`\n## ${titlesByCours[coursId]}\n`);
    for (const field of allFormFields(formsByCours[coursId])) {
      const raw = String(payload[field.key] ?? '');
      const safeLabel = escapeHtml(field.label);
      if (field.kind === 'image' && raw) {
        blocksHtml.push(
          `<p><strong>${safeLabel}</strong><br><a href="${escapeHtml(raw)}">${escapeHtml(raw)}</a><br><img src="${escapeHtml(raw)}" alt="${safeLabel}" style="max-width:560px"></p>`
        );
      } else {
        blocksHtml.push(
          `<p><strong>${safeLabel}</strong><br>${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`
        );
      }
      blocksText.push(`${field.label}\n${raw}\n`);
    }
  }
  const dateFr = new Date(submittedAt).toLocaleString('fr-FR');
  const emailResult = await sendCoachEmail({
    to: coachEmail(),
    subject: `[Pragma] Livrable « ${partie.content.title} » — ${user.email} — ${dateFr}`,
    html: `<p>Livrable <strong>${escapeHtml(partie.content.title ?? '')}</strong> envoyé par ${escapeHtml(user.email ?? '')} le ${escapeHtml(dateFr)}.</p>${blocksHtml.join('\n')}`,
    text: `Livrable ${partie.content.title} — ${user.email} — ${dateFr}\n${blocksText.join('\n')}`,
  });

  return json({ ok: true, submitted_at: submittedAt, email_sent: emailResult.sent, email_warning: emailResult.reason ?? null });
};
