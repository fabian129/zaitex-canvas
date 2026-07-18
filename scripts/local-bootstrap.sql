-- Lokal bootstrap (körs FÖRE migrationerna av scripts/local-stack.mjs).
-- Skapar rollerna, realtime-publikationen och en storage-stub så att
-- prod-migrationerna + seed.sql kan köras oförändrade mot embedded Postgres.

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

do $$ begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- storage-stub: bara det som seed.sql rör (buckets/objects + policy-yta)
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
