import { createServerClient } from '@supabase/ssr';
import type { APIContext } from 'astro';

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function createSupabaseServerClient(context: APIContext) {
  const publishableKey =
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  return createServerClient(import.meta.env.PUBLIC_SUPABASE_URL, publishableKey, {
    cookies: {
      getAll() {
        const header = context.request.headers.get('cookie') ?? '';
        return header
          .split(';')
          .filter(Boolean)
          .map((cookie) => {
            const separator = cookie.indexOf('=');
            return {
              name: cookie.slice(0, separator).trim(),
              value: decodeURIComponent(cookie.slice(separator + 1).trim()),
            };
          });
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          context.cookies.set(name, value, {
            ...options,
            maxAge: SESSION_COOKIE_MAX_AGE,
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: import.meta.env.PROD,
          });
        });
      },
    },
  });
}

export async function getAccessEndDate(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string
) {
  const { data, error } = await supabase
    .from('user_access')
    .select('access_end_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.access_end_date ?? null;
}

export function hasActiveAccess(accessEndDate: string | null) {
  return Boolean(accessEndDate && new Date(accessEndDate).getTime() > Date.now());
}
