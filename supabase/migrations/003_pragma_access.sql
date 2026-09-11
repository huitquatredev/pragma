-- Drop user_access: no longer needed, pragma_inscriptions is the source of truth
drop policy if exists "Users can read their access" on public.user_access;
drop table if exists public.user_access;

-- Enable RLS on pragma_inscriptions so users can read their own row
alter table public.pragma_inscriptions enable row level security;

create policy "Users can read their inscription"
  on public.pragma_inscriptions for select
  using (
    lower(trim(email)) = lower(trim((select email from auth.users where id = auth.uid())))
    or lower(trim(email_discord)) = lower(trim((select email from auth.users where id = auth.uid())))
  );
