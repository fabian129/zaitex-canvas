-- LOKAL STUBB för kringliggande scheman som canvasen relaterar till.
-- I prod (Zaitex os) finns leverans.clients/projects och studio.content_plans/content_items
-- redan — allt här är "if not exists" och blir no-op där. Stubben finns för att den
-- lokala bevis-stacken (supabase start) ska kunna bära canvas-schemats FK:er.

create schema if not exists leverans;
create schema if not exists studio;

-- Rollen som verben grantas till i prod (v5+) — stubben speglar den lokalt.
do $$ begin
  if not exists (select from pg_roles where rolname = 'jarvis_port') then
    create role jarvis_port nologin;
  end if;
end $$;

create table if not exists leverans.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- v5-kolumnerna även om en äldre lokal stubb redan skapat tabellen
alter table leverans.clients add column if not exists company_name text;
alter table leverans.clients add column if not exists deleted_at timestamptz;

create table if not exists leverans.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references leverans.clients(id),
  name text,
  created_at timestamptz not null default now()
);

create table if not exists studio.content_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references leverans.clients(id) on delete cascade,
  project_id uuid references leverans.projects(id),
  month text,
  campaign_name text,
  goals text,
  pillars_json jsonb default '[]'::jsonb,
  status text not null default 'draft',
  notes text,
  strategy_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists studio.content_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references leverans.clients(id) on delete cascade,
  project_id uuid references leverans.projects(id),
  content_plan_id uuid references studio.content_plans(id),
  platform text,
  content_type text,
  title text,
  hook text,
  caption text,
  script text,
  status text not null default 'idea',
  due_date date,
  published_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
