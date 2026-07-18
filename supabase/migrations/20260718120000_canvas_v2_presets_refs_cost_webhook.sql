-- CANVAS V2 (brädet adhoc-d1ca06d0, steg 2-5): motorlandskapets mönster in i canvasen.
--   Steg 2: kamera-presets med stackning (max 3) på shots
--   Steg 3: typade referens-slots per shot (Popcorn-mönstret, max 4)
--   Steg 4: kostnadsbaserat tak i batchgrinden (engine_costs + cap_max_cost)
--   Steg 5: webhook-seam — status 'dispatched' + idempotent callback (fal/Higgsfield-semantik)
-- Identisk i prod (Zaitex os) och i den lokala bevis-stacken.

-- ============================================================
-- STEG 2: kamera-presets på shots (vokabulären lever i appen,
-- DB lagrar preset-id:n; taket max 3 är DB-mekanik, inte UI-policy)
-- ============================================================
alter table canvas.shots add column camera_presets text[] not null default '{}';
alter table canvas.shots add constraint shots_camera_presets_max3
  check (coalesce(array_length(camera_presets, 1), 0) <= 3);

create or replace function public.cv_shot_set_presets(
  p_key text, p_shot_id uuid, p_presets text[]
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  if coalesce(array_length(p_presets, 1), 0) > 3 then
    raise exception 'cv: max 3 kamera-presets per shot (stackningstaket)';
  end if;
  update canvas.shots set camera_presets = coalesce(p_presets, '{}')
  where id = p_shot_id;
  return jsonb_build_object('ok', found, 'id', p_shot_id, 'presets', coalesce(p_presets, '{}'));
end $$;

-- ============================================================
-- STEG 3: referens-slots per shot (Popcorn-mönstret: typade refs,
-- max 4 per shot; kontinuitet = föregående shots valda bild)
-- ============================================================
create table canvas.shot_refs (
  shot_id uuid not null references canvas.shots(id) on delete cascade,
  slot integer not null check (slot between 1 and 4),
  project_id uuid not null references canvas.projects(id) on delete cascade,
  role text not null default 'identitet' check (role in ('identitet','stil','struktur','kontinuitet')),
  media_url text not null,
  variant_id uuid references canvas.variants(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shot_id, slot)
);
create index shot_refs_proj_idx on canvas.shot_refs (project_id);

create trigger touch before update on canvas.shot_refs for each row execute function canvas.tg_touch();
create trigger notify_change after insert or update or delete on canvas.shot_refs
  for each statement execute function canvas.tg_notify();

alter table canvas.shot_refs enable row level security;
grant select on canvas.shot_refs to anon, authenticated, service_role;
create policy cv_read on canvas.shot_refs for select to anon, authenticated using (true);
alter publication supabase_realtime add table canvas.shot_refs;

create view public.cv_shot_refs with (security_invoker=on) as select * from canvas.shot_refs;
revoke all on public.cv_shot_refs from anon, authenticated;
grant select on public.cv_shot_refs to anon, authenticated, service_role;

create or replace function public.cv_shot_ref_set(
  p_key text, p_shot_id uuid, p_slot int, p_media_url text default null,
  p_role text default 'identitet', p_variant_id uuid default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_project uuid; v_url text;
begin
  perform canvas.assert_key(p_key);
  select project_id into v_project from canvas.shots where id = p_shot_id;
  if v_project is null then raise exception 'cv: okänd shot %', p_shot_id; end if;
  v_url := p_media_url;
  if v_url is null and p_variant_id is not null then
    select media_url into v_url from canvas.variants where id = p_variant_id;
  end if;
  if v_url is null then raise exception 'cv: referensen behöver p_media_url eller p_variant_id'; end if;
  insert into canvas.shot_refs (shot_id, slot, project_id, role, media_url, variant_id, note)
  values (p_shot_id, p_slot, v_project, coalesce(p_role, 'identitet'), v_url, p_variant_id, p_note)
  on conflict (shot_id, slot) do update set
    role = excluded.role, media_url = excluded.media_url,
    variant_id = excluded.variant_id, note = excluded.note;
  return jsonb_build_object('ok', true, 'shot_id', p_shot_id, 'slot', p_slot);
end $$;

create or replace function public.cv_shot_ref_clear(
  p_key text, p_shot_id uuid, p_slot int
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  delete from canvas.shot_refs where shot_id = p_shot_id and slot = p_slot;
  return jsonb_build_object('ok', found);
end $$;

-- ============================================================
-- STEG 4: kostnadsbaserat tak — per-motor-kostnad i DB,
-- batchar kan få kostnadsbudget; grinden verkställer i DB.
-- ============================================================
create table canvas.engine_costs (
  engine text primary key,
  cost_units numeric not null default 1 check (cost_units >= 0),
  note text,
  updated_at timestamptz not null default now()
);
insert into canvas.engine_costs (engine, cost_units, note) values
  ('mock-nano-banana', 1, 'mock: billig bildmotor'),
  ('mock-higgsfield', 4, 'mock: dyr videomotor (kreditmodellen)'),
  ('mock-higgsfield-async', 4, 'mock: dyr videomotor i async-läge (webhook-seamen)')
on conflict (engine) do nothing;

alter table canvas.engine_costs enable row level security;
grant select on canvas.engine_costs to anon, authenticated, service_role;
create policy cv_read on canvas.engine_costs for select to anon, authenticated using (true);

create view public.cv_engine_costs with (security_invoker=on) as select * from canvas.engine_costs;
revoke all on public.cv_engine_costs from anon, authenticated;
grant select on public.cv_engine_costs to anon, authenticated, service_role;

alter table canvas.batches add column cap_max_cost numeric; -- null = inget kostnadstak

-- ============================================================
-- STEG 5: webhook-seamen — 'dispatched' mellan running och klar.
-- Callback autentiseras med per-jobb-token; DB lagrar bara HASHEN
-- (token läcker aldrig via vyer/Realtime). Dubbletter/retries är
-- ofarliga (fal-semantik): callback på avslutat item är no-op.
-- ============================================================
alter table canvas.batch_items add column external_job_id text;
alter table canvas.batch_items add column callback_token_hash text;

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'canvas.batch_items'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';
  if c is not null then
    execute format('alter table canvas.batch_items drop constraint %I', c);
  end if;
end $$;
alter table canvas.batch_items add constraint batch_items_status_check
  check (status in ('queued','running','dispatched','succeeded','failed','skipped'));

-- Vyerna skapades som select * (kolumnlistan frystes då) — återskapas med de
-- nya kolumnerna SIST (create or replace tillåter bara tillägg på slutet).
-- callback_token_hash exponeras inte (behövs aldrig utanför verben).
create or replace view public.cv_shots with (security_invoker=on) as
  select id, project_id, scene_id, position, title, description, camera, light, motion,
         duration, status, content_item_id, selected_variant_id, current_prompt_version_id,
         meta, created_at, updated_at, camera_presets
  from canvas.shots;
create or replace view public.cv_batches with (security_invoker=on) as
  select id, project_id, status, engine, cap_max_jobs, approved_by, approved_at, note,
         meta, created_at, updated_at, cap_max_cost
  from canvas.batches;
create or replace view public.cv_batch_items with (security_invoker=on) as
  select id, batch_id, shot_id, prompt_version_id, status, engine, result_variant_id,
         error, cost_units, started_at, finished_at, created_at, updated_at, external_job_id
  from canvas.batch_items;

-- ============================================================
-- VERB-UPPDATERINGAR
-- ============================================================

-- cv_batch_create: ny parameter p_cap_max_cost + kostnadsstämpling per item
-- (ny signatur => gamla funktionen droppas, annars blir named-call tvetydig)
drop function if exists public.cv_batch_create(text, uuid, uuid[], text, int, text);
create or replace function public.cv_batch_create(
  p_key text, p_project_id uuid, p_shot_ids uuid[],
  p_engine text default 'mock-nano-banana', p_cap_max_jobs int default 10,
  p_note text default null, p_cap_max_cost numeric default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_batch uuid; v_shot uuid; v_count int := 0; v_cost numeric;
begin
  perform canvas.assert_key(p_key);
  select cost_units into v_cost from canvas.engine_costs
  where engine = coalesce(p_engine, 'mock-nano-banana');
  insert into canvas.batches (project_id, engine, cap_max_jobs, cap_max_cost, note)
  values (p_project_id, coalesce(p_engine,'mock-nano-banana'), coalesce(p_cap_max_jobs,10), p_cap_max_cost, p_note)
  returning id into v_batch;
  foreach v_shot in array p_shot_ids loop
    insert into canvas.batch_items (batch_id, shot_id, prompt_version_id, engine, cost_units)
    select v_batch, s.id, s.current_prompt_version_id, coalesce(p_engine,'mock-nano-banana'), coalesce(v_cost, 1)
    from canvas.shots s where s.id = v_shot and s.project_id = p_project_id;
    if found then v_count := v_count + 1; end if;
  end loop;
  if v_count = 0 then
    delete from canvas.batches where id = v_batch;
    raise exception 'cv: inga giltiga shots i batchen';
  end if;
  return jsonb_build_object('ok', true, 'id', v_batch, 'items', v_count,
    'est_cost', v_count * coalesce(v_cost, 1));
end $$;

-- cv_batch_approve: taket är nu tvådelat — antal (cap_max_jobs) OCH kumulativ
-- kostnad (cap_max_cost, om satt). Båda verkställs i DB i skapandeordning.
create or replace function public.cv_batch_approve(
  p_key text, p_batch_id uuid, p_approved_by text default 'fabian'
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_cap int; v_cap_cost numeric; v_skipped int; v_queued int; v_cost numeric;
begin
  perform canvas.assert_key(p_key);
  select cap_max_jobs, cap_max_cost into v_cap, v_cap_cost from canvas.batches
  where id = p_batch_id and status = 'pending_approval' for update;
  if v_cap is null then raise exception 'cv: batch % är inte pending_approval', p_batch_id; end if;
  with ranked as (
    select id, row_number() over (order by created_at, id) as rn,
           sum(cost_units) over (order by created_at, id
             rows between unbounded preceding and current row) as cum_cost
    from canvas.batch_items where batch_id = p_batch_id and status = 'queued'
  )
  update canvas.batch_items bi
  set status = 'skipped',
      error = case when r.rn > v_cap then 'över taket (cap_max_jobs)'
                   else 'över taket (cap_max_cost)' end
  from ranked r
  where bi.id = r.id
    and (r.rn > v_cap or (v_cap_cost is not null and r.cum_cost > v_cap_cost));
  get diagnostics v_skipped = row_count;
  update canvas.batches set status = 'approved', approved_by = p_approved_by, approved_at = now()
  where id = p_batch_id;
  update canvas.shots s set status = 'queued'
  from canvas.batch_items bi
  where bi.batch_id = p_batch_id and bi.status = 'queued' and s.id = bi.shot_id;
  select count(*), coalesce(sum(cost_units), 0) into v_queued, v_cost
  from canvas.batch_items where batch_id = p_batch_id and status = 'queued';
  return jsonb_build_object('ok', true, 'id', p_batch_id, 'queued', v_queued,
    'skipped', v_skipped, 'queued_cost', v_cost);
end $$;

-- cv_batch_cancel: även dispatchade jobb avbryts (motorns svar blir no-op via callback-idempotensen)
create or replace function public.cv_batch_cancel(
  p_key text, p_batch_id uuid
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.batch_items set status = 'skipped', error = 'batch avbruten'
  where batch_id = p_batch_id and status in ('queued','running','dispatched');
  update canvas.batches set status = 'cancelled' where id = p_batch_id;
  return jsonb_build_object('ok', found, 'id', p_batch_id);
end $$;

-- batch_done_check: dispatched räknas som in-flight
create or replace function canvas.batch_done_check(p_batch_id uuid) returns void
language plpgsql security definer set search_path = canvas, pg_temp as $$
begin
  if not exists (select 1 from canvas.batch_items
                 where batch_id = p_batch_id and status in ('queued','running','dispatched')) then
    update canvas.batches set status = 'done' where id = p_batch_id and status in ('approved','running');
  end if;
end $$;

-- cv_job_claim: jobbet bär nu även referens-slots + kamera-presets (adapters får allt de behöver)
create or replace function public.cv_job_claim(
  p_key text, p_engine text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_item record; v_prompt text; v_chain jsonb;
begin
  perform canvas.assert_key(p_key);
  select bi.id, bi.batch_id, bi.shot_id, bi.prompt_version_id, b.engine, b.project_id
    into v_item
  from canvas.batch_items bi
  join canvas.batches b on b.id = bi.batch_id
  where bi.status = 'queued' and b.status in ('approved','running')
    and (p_engine is null or b.engine = p_engine)
  order by bi.created_at, bi.id
  limit 1
  for update of bi skip locked;
  if v_item.id is null then return jsonb_build_object('ok', true, 'job', null); end if;
  update canvas.batch_items set status = 'running', started_at = now() where id = v_item.id;
  update canvas.batches set status = 'running' where id = v_item.batch_id and status = 'approved';
  select pv.compiled, pv.chain into v_prompt, v_chain
  from canvas.prompt_versions pv where pv.id = v_item.prompt_version_id;
  if v_prompt is null or v_prompt = '' then
    select trim(concat_ws('. ', nullif(s.description,''), nullif(s.camera,''), nullif(s.light,''), nullif(s.motion,'')))
    into v_prompt from canvas.shots s where s.id = v_item.shot_id;
  end if;
  return jsonb_build_object('ok', true, 'job', jsonb_build_object(
    'item_id', v_item.id, 'batch_id', v_item.batch_id, 'shot_id', v_item.shot_id,
    'project_id', v_item.project_id, 'engine', v_item.engine,
    'prompt', coalesce(v_prompt,''), 'chain', coalesce(v_chain,'[]'::jsonb),
    'camera_presets', coalesce((select to_jsonb(s.camera_presets) from canvas.shots s where s.id = v_item.shot_id), '[]'::jsonb),
    'refs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot', r.slot, 'role', r.role, 'media_url', r.media_url, 'note', r.note) order by r.slot)
      from canvas.shot_refs r where r.shot_id = v_item.shot_id), '[]'::jsonb)));
end $$;

-- cv_job_fail: även dispatchade jobb kan felmarkeras (submit-fel efter dispatch, död motor)
create or replace function public.cv_job_fail(
  p_key text, p_item_id uuid, p_error text
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_batch uuid;
begin
  perform canvas.assert_key(p_key);
  update canvas.batch_items set status = 'failed', finished_at = now(), error = p_error
  where id = p_item_id and status in ('running','dispatched')
  returning batch_id into v_batch;
  if v_batch is null then raise exception 'cv: item % är inte running/dispatched', p_item_id; end if;
  perform canvas.batch_done_check(v_batch);
  return jsonb_build_object('ok', true);
end $$;

-- cv_job_dispatch: running → dispatched. Genererar callback-token (returneras EN gång,
-- endast hashen lagras). Adaptern skickar token + callback-URL till motorn (X-Webhook-URL).
create or replace function public.cv_job_dispatch(
  p_key text, p_item_id uuid, p_external_job_id text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_token text;
begin
  perform canvas.assert_key(p_key);
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  update canvas.batch_items
  set status = 'dispatched', external_job_id = p_external_job_id,
      callback_token_hash = encode(sha256(v_token::bytea), 'hex')
  where id = p_item_id and status = 'running';
  if not found then raise exception 'cv: item % är inte running', p_item_id; end if;
  return jsonb_build_object('ok', true, 'item_id', p_item_id, 'callback_token', v_token);
end $$;

-- cv_job_callback: motorns webhook landar här (via /api/engine-callback).
-- IDEMPOTENT: retries/dubbletter på avslutade items är no-op (ok:true, already:true).
-- Autentisering: per-jobb-token (hash-jämförelse) — INTE verb-nyckeln; motorn ser aldrig den.
create or replace function public.cv_job_callback(
  p_key text, p_item_id uuid, p_token text, p_status text,
  p_media_url text default null, p_meta jsonb default '{}'::jsonb,
  p_error text default null, p_external_job_id text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_item record; v_variant uuid; v_prompt text;
begin
  perform canvas.assert_key(p_key);
  if p_status not in ('succeeded','failed') then
    raise exception 'cv: callback-status måste vara succeeded|failed';
  end if;
  select bi.id, bi.batch_id, bi.shot_id, bi.prompt_version_id, bi.status, bi.callback_token_hash,
         b.engine, b.project_id
    into v_item
  from canvas.batch_items bi join canvas.batches b on b.id = bi.batch_id
  where bi.id = p_item_id for update of bi;
  if v_item.id is null then raise exception 'cv: okänt item %', p_item_id; end if;
  if v_item.callback_token_hash is distinct from encode(sha256(p_token::bytea), 'hex') then
    raise exception 'cv: ogiltig callback-token';
  end if;
  if v_item.status in ('succeeded','failed','skipped') then
    return jsonb_build_object('ok', true, 'already', true, 'status', v_item.status);
  end if;
  if v_item.status <> 'dispatched' then
    raise exception 'cv: item % är inte dispatched (status: %)', p_item_id, v_item.status;
  end if;
  if p_status = 'failed' then
    update canvas.batch_items
    set status = 'failed', finished_at = now(), error = coalesce(p_error, 'motorfel utan detalj'),
        external_job_id = coalesce(p_external_job_id, external_job_id)
    where id = p_item_id;
    perform canvas.batch_done_check(v_item.batch_id);
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;
  if p_media_url is null then raise exception 'cv: succeeded-callback kräver p_media_url'; end if;
  select pv.compiled into v_prompt from canvas.prompt_versions pv where pv.id = v_item.prompt_version_id;
  insert into canvas.variants (project_id, shot_id, source, media_url, prompt, engine, batch_item_id, meta)
  values (v_item.project_id, v_item.shot_id, 'engine:' || v_item.engine, p_media_url,
          v_prompt, v_item.engine, v_item.id, coalesce(p_meta, '{}'::jsonb))
  returning id into v_variant;
  update canvas.batch_items
  set status = 'succeeded', finished_at = now(), result_variant_id = v_variant,
      external_job_id = coalesce(p_external_job_id, external_job_id)
  where id = p_item_id;
  update canvas.shots set status = 'generated' where id = v_item.shot_id and status = 'queued';
  perform canvas.batch_done_check(v_item.batch_id);
  return jsonb_build_object('ok', true, 'status', 'succeeded', 'variant_id', v_variant);
end $$;
