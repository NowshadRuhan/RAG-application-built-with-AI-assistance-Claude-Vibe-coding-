-- Module 1: one OpenAI vector store per conversation (files scoped to that thread).

create extension if not exists "uuid-ossp";

create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  openai_previous_response_id text,
  openai_vector_store_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations (user_id);

alter table public.conversations enable row level security;

create policy "conversations_select_own"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "conversations_insert_own"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "conversations_update_own"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "conversations_delete_own"
  on public.conversations for delete
  using (auth.uid() = user_id);
