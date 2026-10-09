-- Livrables: form answers per cours + submissions per partie + correction access flag.
-- Apply in Supabase dashboard (SQL editor) after 001/002/003.

-- 1) Access flag for correction (coach review). Managed manually in pragma_inscriptions.
alter table public.pragma_inscriptions
  add column if not exists correction boolean not null default false;

-- Test account: allow submission for huitquatre.dev@gmail.com
update public.pragma_inscriptions
  set correction = true
  where lower(trim(email)) = lower(trim('huitquatre.dev@gmail.com'))
     or lower(trim(email_discord)) = lower(trim('huitquatre.dev@gmail.com'));

-- 2) One row per (user, cours): payload keys are stable field keys, values are strings/numbers/urls.
create table if not exists public.form_answers (
  user_id uuid not null references auth.users(id) on delete cascade,
  cours_id text not null,
  partie_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, cours_id)
);

create index if not exists form_answers_user_partie_idx
  on public.form_answers(user_id, partie_id);

alter table public.form_answers enable row level security;

drop policy if exists "Users can read their answers" on public.form_answers;
create policy "Users can read their answers"
  on public.form_answers for select using (auth.uid() = user_id);

drop policy if exists "Users can save their answers" on public.form_answers;
create policy "Users can save their answers"
  on public.form_answers for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their answers" on public.form_answers;
create policy "Users can update their answers"
  on public.form_answers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their answers" on public.form_answers;
create policy "Users can delete their answers"
  on public.form_answers for delete using (auth.uid() = user_id);

-- 3) One row per (user, partie): keeps the date of the last "Envoyer pour relecture".
create table if not exists public.livrable_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  partie_id text not null,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  primary key (user_id, partie_id)
);

alter table public.livrable_submissions enable row level security;

drop policy if exists "Users can read their submissions" on public.livrable_submissions;
create policy "Users can read their submissions"
  on public.livrable_submissions for select using (auth.uid() = user_id);

drop policy if exists "Users can save their submissions" on public.livrable_submissions;
create policy "Users can save their submissions"
  on public.livrable_submissions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their submissions" on public.livrable_submissions;
create policy "Users can update their submissions"
  on public.livrable_submissions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Private storage bucket for screen captures. Public read so the coach can open
-- image URLs received by email; write restricted to the owner folder {user_id}/...
insert into storage.buckets (id, name, public)
  values ('livrable-images', 'livrable-images', true)
  on conflict (id) do update set public = true;

drop policy if exists "Owners can upload livrable images" on storage.objects;
create policy "Owners can upload livrable images"
  on storage.objects for insert with check (
    bucket_id = 'livrable-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owners can update livrable images" on storage.objects;
create policy "Owners can update livrable images"
  on storage.objects for update using (
    bucket_id = 'livrable-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'livrable-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owners can delete livrable images" on storage.objects;
create policy "Owners can delete livrable images"
  on storage.objects for delete using (
    bucket_id = 'livrable-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Anyone can read livrable images" on storage.objects;
create policy "Anyone can read livrable images"
  on storage.objects for select using (bucket_id = 'livrable-images');
