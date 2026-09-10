create or replace function public.is_eligible_login_email(candidate_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pragma_inscriptions
    where lower(trim(candidate_email)) = lower(trim(email))
       or lower(trim(candidate_email)) = lower(trim(email_discord))
  );
$$;

revoke all on function public.is_eligible_login_email(text) from public;
grant execute on function public.is_eligible_login_email(text) to anon, authenticated;
