-- FÖNSTER 3: canvasen — eget schema. Relaterar till leverans.clients + studio.content_items/content_plans.
-- Identisk med prod-migrationen canvas_v1_tables (applicerad i Zaitex os 2026-07-18).
create schema if not exists canvas;

create table canvas.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_id uuid references leverans.clients(id) on delete set null,
  content_plan_id uuid references studio.content_plans(id) on delete set null,
  content_item_id uuid references studio.content_items(id) on delete set null,
  format text not null default '16:9',
  status text not null default 'draft' check (status in ('draft','active','delivered','archived')),
  brief text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table canvas.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references canvas.projects(id) on delete cascade,
  title text not null default '',
  beat text,
  position integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table canvas.shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references canvas.projects(id) on delete cascade,
  scene_id uuid not null references canvas.scenes(id) on delete cascade,
  position integer not null default 0,
  title text not null default '',
  description text not null default '',
  camera text not null default '',
  light text not null default '',
  motion text not null default '',
  duration real not null default 3.0,
  status text not null default 'idea' check (status in ('idea','ready','queued','generated','curated','locked')),
  content_item_id uuid references studio.content_items(id) on delete set null,
  selected_variant_id uuid,
  current_prompt_version_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table canvas.variants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references canvas.projects(id) on delete cascade,
  shot_id uuid references canvas.shots(id) on delete cascade,
  source text not null default 'agent',
  status text not null default 'new' check (status in ('new','kept','rejected')),
  media_url text not null,
  media_type text not null default 'image',
  prompt text,
  engine text,
  batch_item_id uuid,
  comment text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table canvas.souls (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  kind text not null default 'character' check (kind in ('character','place','prop','style')),
  name text not null,
  description text not null default '',
  prompt_fragment text not null default '',
  negative_fragment text not null default '',
  ref_urls text[] not null default '{}',
  client_id uuid references leverans.clients(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table canvas.shot_souls (
  shot_id uuid not null references canvas.shots(id) on delete cascade,
  soul_id uuid not null references canvas.souls(id) on delete cascade,
  role text not null default 'subject',
  position integer not null default 0,
  primary key (shot_id, soul_id)
);

create table canvas.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null references canvas.shots(id) on delete cascade,
  version integer not null,
  chain jsonb not null default '[]'::jsonb,
  compiled text not null default '',
  engine_hint text,
  note text,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  unique (shot_id, version)
);

create table canvas.batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references canvas.projects(id) on delete cascade,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','running','done','cancelled')),
  engine text not null default 'mock-nano-banana',
  cap_max_jobs integer not null default 10,
  approved_by text,
  approved_at timestamptz,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table canvas.batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references canvas.batches(id) on delete cascade,
  shot_id uuid not null references canvas.shots(id) on delete cascade,
  prompt_version_id uuid references canvas.prompt_versions(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','skipped')),
  engine text,
  result_variant_id uuid references canvas.variants(id) on delete set null,
  error text,
  cost_units numeric not null default 1,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table canvas.shots
  add constraint shots_selected_variant_fk foreign key (selected_variant_id) references canvas.variants(id) on delete set null,
  add constraint shots_current_prompt_fk foreign key (current_prompt_version_id) references canvas.prompt_versions(id) on delete set null;

alter table canvas.variants
  add constraint variants_batch_item_fk foreign key (batch_item_id) references canvas.batch_items(id) on delete set null;

-- verb-nyckel m.m. — läses ALDRIG av anon (inga grants)
create table canvas.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index scenes_proj_pos_idx on canvas.scenes (project_id, position);
create index shots_scene_pos_idx on canvas.shots (scene_id, position);
create index shots_proj_idx on canvas.shots (project_id);
create index variants_shot_idx on canvas.variants (shot_id, created_at);
create index variants_tray_idx on canvas.variants (project_id) where shot_id is null;
create index pv_shot_ver_idx on canvas.prompt_versions (shot_id, version desc);
create index bi_batch_status_idx on canvas.batch_items (batch_id, status);
create index batches_proj_idx on canvas.batches (project_id, created_at desc);

create or replace function canvas.tg_touch() returns trigger
language plpgsql set search_path = canvas, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch before update on canvas.projects for each row execute function canvas.tg_touch();
create trigger touch before update on canvas.scenes for each row execute function canvas.tg_touch();
create trigger touch before update on canvas.shots for each row execute function canvas.tg_touch();
create trigger touch before update on canvas.variants for each row execute function canvas.tg_touch();
create trigger touch before update on canvas.souls for each row execute function canvas.tg_touch();
create trigger touch before update on canvas.batches for each row execute function canvas.tg_touch();
create trigger touch before update on canvas.batch_items for each row execute function canvas.tg_touch();
