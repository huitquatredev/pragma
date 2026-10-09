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

export interface Inscription {
  upgrade: boolean;
  camille: boolean;
  correction: boolean;
  first_name: string | null;
  last_name: string | null;
}

export const previewInscription: Inscription = {
  upgrade: true,
  camille: true,
  correction: true,
  first_name: null,
  last_name: null,
};

export async function getInscription(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  email: string
): Promise<Inscription | null> {
  const trimmed = email.trim();
  let { data, error } = await supabase
    .from('pragma_inscriptions')
    .select('upgrade, camille, correction, first_name, last_name')
    .ilike('email', trimmed)
    .limit(1)
    .maybeSingle();

  if (!data) {
    ({ data, error } = await supabase
      .from('pragma_inscriptions')
      .select('upgrade, camille, correction, first_name, last_name')
      .ilike('email_discord', trimmed)
      .limit(1)
      .maybeSingle());
  }

  if (error) return null;
  if (!data) return null;
  return {
    upgrade: Boolean(data.upgrade),
    camille: Boolean(data.camille),
    correction: Boolean((data as Record<string, unknown>).correction ?? false),
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
  };
}
