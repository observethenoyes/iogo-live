-- User credentials table. One row per user.
-- The octopus_api_key is encrypted server-side (AES-256-GCM) before insertion
-- so the plaintext key never reaches Supabase storage. The encryption key
-- lives in SUPABASE_ENCRYPTION_KEY on Vercel, never in the database.

create table public.user_credentials (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  api_key_encrypted   text not null,
  api_key_iv          text not null,
  api_key_tag         text not null,
  account_number      text not null,
  mpan                text not null,
  meter_serial        text not null,
  product_code        text not null,
  tariff_code         text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint user_credentials_user_id_unique unique (user_id)
);

-- RLS: users can only see and modify their own credentials.
alter table public.user_credentials enable row level security;

create policy "Users can read own credentials"
  on public.user_credentials for select
  using (auth.uid() = user_id);

create policy "Users can insert own credentials"
  on public.user_credentials for insert
  with check (auth.uid() = user_id);

create policy "Users can update own credentials"
  on public.user_credentials for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own credentials"
  on public.user_credentials for delete
  using (auth.uid() = user_id);

create index idx_user_credentials_user_id on public.user_credentials(user_id);

-- Auto-update updated_at on modification.
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.user_credentials
  for each row
  execute function public.handle_updated_at();
