import type { APIRoute } from 'astro';
import { fetchStory } from '../../../lib/storyblok';
import { hasCourseAccess } from '../../../lib/progress';

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/login');
  const form = await context.request.formData();
  const action = form.get('action');
  const slug = context.params.slug;
  if (!slug || (action !== 'validate' && action !== 'unvalidate')) {
    return new Response('Requête invalide.', { status: 400 });
  }
  const story = await fetchStory(slug);
  const inscription = context.locals.inscription;
  if (inscription && !hasCourseAccess(story, inscription)) {
    return new Response('Accès non autorisé.', { status: 403 });
  }
  const supabase = context.locals.supabase;
  if (!supabase) return context.redirect('/login');
  const result =
    action === 'validate'
      ? await supabase.from('progress').upsert({ user_id: user.id, cours_id: story.uuid })
      : await supabase.from('progress').delete().eq('user_id', user.id).eq('cours_id', story.uuid);
  if (result.error) throw result.error;
  return context.redirect(`/cours/${slug}`);
};
