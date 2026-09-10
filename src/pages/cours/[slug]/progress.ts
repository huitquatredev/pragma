import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { fetchStory } from '../../../lib/storyblok';

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
  const supabase = createSupabaseServerClient(context);
  const result =
    action === 'validate'
      ? await supabase.from('progress').upsert({ user_id: user.id, cours_id: story.uuid })
      : await supabase.from('progress').delete().eq('user_id', user.id).eq('cours_id', story.uuid);
  if (result.error) throw result.error;
  return context.redirect(`/cours/${slug}`);
};
