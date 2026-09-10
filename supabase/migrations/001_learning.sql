create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_end_date timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  cours_id text not null,
  validated_at timestamptz not null default now(),
  primary key (user_id, cours_id)
);

create index if not exists user_access_end_date_idx on public.user_access(access_end_date);
create index if not exists progress_user_idx on public.progress(user_id);

alter table public.user_access enable row level security;
alter table public.progress enable row level security;

create policy "Users can read their access"
  on public.user_access for select using (auth.uid() = user_id);

create policy "Users can read their progress"
  on public.progress for select using (auth.uid() = user_id);

create policy "Users can create their progress"
  on public.progress for insert with check (auth.uid() = user_id);

create policy "Users can update their progress"
  on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their progress"
  on public.progress for delete using (auth.uid() = user_id);
