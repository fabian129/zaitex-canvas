-- Skriv-verb för canvasen. Mönster: security definer + verb-nyckel (canvas.app_config).
-- Anropas av Next-appens server-routes (anon-nyckel + CANVAS_VERB_KEY) och av agenter (postgres/SQL).
-- Identisk med prod-migrationen canvas_v1_verbs.

insert into canvas.app_config (key, value)
values ('verb_key', replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
on conflict (key) do nothing;

create or replace function canvas.assert_key(p_key text) returns void
language plpgsql security definer set search_path = canvas, pg_temp as $$
begin
  if p_key is distinct from (select value from canvas.app_config where key = 'verb_key') then
    raise exception 'cv: ogiltig verb-nyckel';
  end if;
end $$;

create or replace function public.cv_project_create(
  p_key text, p_title text, p_client_id uuid default null,
  p_content_plan_id uuid default null, p_content_item_id uuid default null,
  p_format text default '16:9', p_brief text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid;
begin
  perform canvas.assert_key(p_key);
  insert into canvas.projects (title, client_id, content_plan_id, content_item_id, format, brief)
  values (p_title, p_client_id, p_content_plan_id, p_content_item_id, coalesce(p_format,'16:9'), p_brief)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.cv_project_set(
  p_key text, p_project_id uuid, p_title text default null, p_status text default null,
  p_format text default null, p_brief text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.projects set
    title = coalesce(p_title, title),
    status = coalesce(p_status, status),
    format = coalesce(p_format, format),
    brief = coalesce(p_brief, brief)
  where id = p_project_id;
  return jsonb_build_object('ok', found, 'id', p_project_id);
end $$;

create or replace function public.cv_scene_add(
  p_key text, p_project_id uuid, p_title text default '', p_beat text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid; v_pos int;
begin
  perform canvas.assert_key(p_key);
  select coalesce(max(position),-1)+1 into v_pos from canvas.scenes where project_id = p_project_id;
  insert into canvas.scenes (project_id, title, beat, position)
  values (p_project_id, coalesce(p_title,''), p_beat, v_pos) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'position', v_pos);
end $$;

create or replace function public.cv_scene_set(
  p_key text, p_scene_id uuid, p_title text default null, p_beat text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.scenes set title = coalesce(p_title, title), beat = coalesce(p_beat, beat)
  where id = p_scene_id;
  return jsonb_build_object('ok', found, 'id', p_scene_id);
end $$;

create or replace function public.cv_scene_reorder(
  p_key text, p_project_id uuid, p_scene_ids uuid[]
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare i int;
begin
  perform canvas.assert_key(p_key);
  for i in 1..coalesce(array_length(p_scene_ids,1),0) loop
    update canvas.scenes set position = i-1
    where id = p_scene_ids[i] and project_id = p_project_id;
  end loop;
  return jsonb_build_object('ok', true, 'count', coalesce(array_length(p_scene_ids,1),0));
end $$;

create or replace function public.cv_shot_add(
  p_key text, p_scene_id uuid, p_title text default '', p_description text default '',
  p_camera text default '', p_light text default '', p_motion text default '',
  p_duration real default 3.0
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid; v_pos int; v_project uuid;
begin
  perform canvas.assert_key(p_key);
  select project_id into v_project from canvas.scenes where id = p_scene_id;
  if v_project is null then raise exception 'cv: okänd scen %', p_scene_id; end if;
  select coalesce(max(position),-1)+1 into v_pos from canvas.shots where scene_id = p_scene_id;
  insert into canvas.shots (project_id, scene_id, position, title, description, camera, light, motion, duration)
  values (v_project, p_scene_id, v_pos, coalesce(p_title,''), coalesce(p_description,''),
          coalesce(p_camera,''), coalesce(p_light,''), coalesce(p_motion,''), coalesce(p_duration,3.0))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'position', v_pos);
end $$;

create or replace function public.cv_shot_set(
  p_key text, p_shot_id uuid, p_title text default null, p_description text default null,
  p_camera text default null, p_light text default null, p_motion text default null,
  p_duration real default null, p_status text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.shots set
    title = coalesce(p_title, title),
    description = coalesce(p_description, description),
    camera = coalesce(p_camera, camera),
    light = coalesce(p_light, light),
    motion = coalesce(p_motion, motion),
    duration = coalesce(p_duration, duration),
    status = coalesce(p_status, status)
  where id = p_shot_id;
  return jsonb_build_object('ok', found, 'id', p_shot_id);
end $$;

-- Drag-omordning: klienten skickar mål-scen + hela shot-ordningen för den scenen.
-- Shots i listan som ligger i annan scen flyttas hit (samma projekt).
create or replace function public.cv_shot_reorder(
  p_key text, p_scene_id uuid, p_shot_ids uuid[]
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare i int; v_project uuid;
begin
  perform canvas.assert_key(p_key);
  select project_id into v_project from canvas.scenes where id = p_scene_id;
  if v_project is null then raise exception 'cv: okänd scen %', p_scene_id; end if;
  for i in 1..coalesce(array_length(p_shot_ids,1),0) loop
    update canvas.shots set scene_id = p_scene_id, position = i-1
    where id = p_shot_ids[i] and project_id = v_project;
  end loop;
  return jsonb_build_object('ok', true, 'count', coalesce(array_length(p_shot_ids,1),0));
end $$;

create or replace function public.cv_remove(
  p_key text, p_kind text, p_id uuid
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  case p_kind
    when 'project' then delete from canvas.projects where id = p_id;
    when 'scene'   then delete from canvas.scenes where id = p_id;
    when 'shot'    then delete from canvas.shots where id = p_id;
    when 'variant' then delete from canvas.variants where id = p_id;
    when 'soul'    then delete from canvas.souls where id = p_id;
    else raise exception 'cv: okänd kind %', p_kind;
  end case;
  return jsonb_build_object('ok', found, 'kind', p_kind, 'id', p_id);
end $$;

-- INTAG: agent lägger bilder via DB-rader (variant-rack-mönstret). shot_id null = intags-tray.
create or replace function public.cv_intake(
  p_key text, p_project_id uuid, p_media_url text, p_shot_id uuid default null,
  p_source text default 'agent', p_prompt text default null,
  p_media_type text default 'image', p_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid;
begin
  perform canvas.assert_key(p_key);
  if p_shot_id is not null and not exists (
    select 1 from canvas.shots where id = p_shot_id and project_id = p_project_id
  ) then
    raise exception 'cv: shot % hör inte till projekt %', p_shot_id, p_project_id;
  end if;
  insert into canvas.variants (project_id, shot_id, source, media_url, media_type, prompt, meta)
  values (p_project_id, p_shot_id, coalesce(p_source,'agent'), p_media_url,
          coalesce(p_media_type,'image'), p_prompt, coalesce(p_meta,'{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.cv_variant_curate(
  p_key text, p_variant_id uuid, p_status text default null, p_comment text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.variants set
    status = coalesce(p_status, status),
    comment = coalesce(p_comment, comment)
  where id = p_variant_id;
  return jsonb_build_object('ok', found, 'id', p_variant_id);
end $$;

create or replace function public.cv_variant_assign(
  p_key text, p_variant_id uuid, p_shot_id uuid
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_project uuid;
begin
  perform canvas.assert_key(p_key);
  select project_id into v_project from canvas.shots where id = p_shot_id;
  if v_project is null then raise exception 'cv: okänd shot %', p_shot_id; end if;
  update canvas.variants set shot_id = p_shot_id, project_id = v_project
  where id = p_variant_id;
  return jsonb_build_object('ok', found, 'id', p_variant_id);
end $$;

create or replace function public.cv_shot_select_variant(
  p_key text, p_shot_id uuid, p_variant_id uuid default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  if p_variant_id is not null then
    update canvas.variants set status = 'kept' where id = p_variant_id and shot_id = p_shot_id;
    if not found then raise exception 'cv: variant % hör inte till shot %', p_variant_id, p_shot_id; end if;
  end if;
  update canvas.shots set
    selected_variant_id = p_variant_id,
    status = case when p_variant_id is null then status else 'curated' end
  where id = p_shot_id;
  return jsonb_build_object('ok', found, 'shot_id', p_shot_id, 'variant_id', p_variant_id);
end $$;

-- SOUL ID:s: persistenta objekt (karaktär/plats/prop/stil) — återanvänds över projekt.
create or replace function public.cv_soul_upsert(
  p_key text, p_soul_key text, p_name text, p_kind text default 'character',
  p_prompt_fragment text default '', p_negative_fragment text default '',
  p_description text default '', p_ref_urls text[] default '{}', p_client_id uuid default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid;
begin
  perform canvas.assert_key(p_key);
  insert into canvas.souls (key, name, kind, prompt_fragment, negative_fragment, description, ref_urls, client_id)
  values (p_soul_key, p_name, coalesce(p_kind,'character'), coalesce(p_prompt_fragment,''),
          coalesce(p_negative_fragment,''), coalesce(p_description,''), coalesce(p_ref_urls,'{}'), p_client_id)
  on conflict (key) do update set
    name = excluded.name, kind = excluded.kind,
    prompt_fragment = excluded.prompt_fragment,
    negative_fragment = excluded.negative_fragment,
    description = excluded.description,
    ref_urls = excluded.ref_urls,
    client_id = excluded.client_id
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'key', p_soul_key);
end $$;

create or replace function public.cv_shot_soul_link(
  p_key text, p_shot_id uuid, p_soul_id uuid, p_role text default 'subject'
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  insert into canvas.shot_souls (shot_id, soul_id, role)
  values (p_shot_id, p_soul_id, coalesce(p_role,'subject'))
  on conflict (shot_id, soul_id) do update set role = excluded.role;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cv_shot_soul_unlink(
  p_key text, p_shot_id uuid, p_soul_id uuid
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  delete from canvas.shot_souls where shot_id = p_shot_id and soul_id = p_soul_id;
  return jsonb_build_object('ok', found);
end $$;

-- PROMPT-KEDJAN: versionerad per shot. chain = ordnad lista av operationssteg (jsonb).
create or replace function public.cv_prompt_save(
  p_key text, p_shot_id uuid, p_chain jsonb, p_compiled text,
  p_engine_hint text default null, p_note text default null, p_created_by text default 'user'
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_ver int; v_id uuid;
begin
  perform canvas.assert_key(p_key);
  select coalesce(max(version),0)+1 into v_ver from canvas.prompt_versions where shot_id = p_shot_id;
  insert into canvas.prompt_versions (shot_id, version, chain, compiled, engine_hint, note, created_by)
  values (p_shot_id, v_ver, coalesce(p_chain,'[]'::jsonb), coalesce(p_compiled,''), p_engine_hint, p_note, coalesce(p_created_by,'user'))
  returning id into v_id;
  update canvas.shots set current_prompt_version_id = v_id,
    status = case when status = 'idea' then 'ready' else status end
  where id = p_shot_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver);
end $$;

-- BATCHGRINDEN: markera shots -> jobblista (pending_approval) -> godkännande med tak -> adapter-kö.
create or replace function public.cv_batch_create(
  p_key text, p_project_id uuid, p_shot_ids uuid[],
  p_engine text default 'mock-nano-banana', p_cap_max_jobs int default 10, p_note text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_batch uuid; v_shot uuid; v_count int := 0;
begin
  perform canvas.assert_key(p_key);
  insert into canvas.batches (project_id, engine, cap_max_jobs, note)
  values (p_project_id, coalesce(p_engine,'mock-nano-banana'), coalesce(p_cap_max_jobs,10), p_note)
  returning id into v_batch;
  foreach v_shot in array p_shot_ids loop
    insert into canvas.batch_items (batch_id, shot_id, prompt_version_id, engine)
    select v_batch, s.id, s.current_prompt_version_id, coalesce(p_engine,'mock-nano-banana')
    from canvas.shots s where s.id = v_shot and s.project_id = p_project_id;
    if found then v_count := v_count + 1; end if;
  end loop;
  if v_count = 0 then
    delete from canvas.batches where id = v_batch;
    raise exception 'cv: inga giltiga shots i batchen';
  end if;
  return jsonb_build_object('ok', true, 'id', v_batch, 'items', v_count);
end $$;

create or replace function public.cv_batch_approve(
  p_key text, p_batch_id uuid, p_approved_by text default 'fabian'
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_cap int; v_skipped int; v_queued int;
begin
  perform canvas.assert_key(p_key);
  select cap_max_jobs into v_cap from canvas.batches
  where id = p_batch_id and status = 'pending_approval' for update;
  if v_cap is null then raise exception 'cv: batch % är inte pending_approval', p_batch_id; end if;
  -- Taket: allt bortom cap_max_jobs (i skapandeordning) skippas — grinden är MEKANIK, inte en policy i UI:t.
  with ranked as (
    select id, row_number() over (order by created_at, id) as rn
    from canvas.batch_items where batch_id = p_batch_id and status = 'queued'
  )
  update canvas.batch_items bi set status = 'skipped', error = 'över taket (cap_max_jobs)'
  from ranked r where bi.id = r.id and r.rn > v_cap;
  get diagnostics v_skipped = row_count;
  update canvas.batches set status = 'approved', approved_by = p_approved_by, approved_at = now()
  where id = p_batch_id;
  update canvas.shots s set status = 'queued'
  from canvas.batch_items bi
  where bi.batch_id = p_batch_id and bi.status = 'queued' and s.id = bi.shot_id;
  select count(*) into v_queued from canvas.batch_items where batch_id = p_batch_id and status = 'queued';
  return jsonb_build_object('ok', true, 'id', p_batch_id, 'queued', v_queued, 'skipped', v_skipped);
end $$;

create or replace function public.cv_batch_cancel(
  p_key text, p_batch_id uuid
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.batch_items set status = 'skipped', error = 'batch avbruten'
  where batch_id = p_batch_id and status in ('queued','running');
  update canvas.batches set status = 'cancelled' where id = p_batch_id;
  return jsonb_build_object('ok', found, 'id', p_batch_id);
end $$;

-- ADAPTER-KÖN: runnern claimar atomiskt (skip locked), kör motorn (mock i natt), rapporterar.
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
    'prompt', coalesce(v_prompt,''), 'chain', coalesce(v_chain,'[]'::jsonb)));
end $$;

create or replace function canvas.batch_done_check(p_batch_id uuid) returns void
language plpgsql security definer set search_path = canvas, pg_temp as $$
begin
  if not exists (select 1 from canvas.batch_items where batch_id = p_batch_id and status in ('queued','running')) then
    update canvas.batches set status = 'done' where id = p_batch_id and status in ('approved','running');
  end if;
end $$;

create or replace function public.cv_job_finish(
  p_key text, p_item_id uuid, p_media_url text, p_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_item record; v_variant uuid; v_prompt text;
begin
  perform canvas.assert_key(p_key);
  select bi.id, bi.batch_id, bi.shot_id, bi.prompt_version_id, b.engine, b.project_id
    into v_item
  from canvas.batch_items bi join canvas.batches b on b.id = bi.batch_id
  where bi.id = p_item_id and bi.status = 'running' for update of bi;
  if v_item.id is null then raise exception 'cv: item % är inte running', p_item_id; end if;
  select pv.compiled into v_prompt from canvas.prompt_versions pv where pv.id = v_item.prompt_version_id;
  insert into canvas.variants (project_id, shot_id, source, media_url, prompt, engine, batch_item_id, meta)
  values (v_item.project_id, v_item.shot_id, 'engine:' || v_item.engine, p_media_url,
          v_prompt, v_item.engine, v_item.id, coalesce(p_meta,'{}'::jsonb))
  returning id into v_variant;
  update canvas.batch_items set status = 'succeeded', finished_at = now(), result_variant_id = v_variant
  where id = p_item_id;
  update canvas.shots set status = 'generated' where id = v_item.shot_id and status = 'queued';
  perform canvas.batch_done_check(v_item.batch_id);
  return jsonb_build_object('ok', true, 'variant_id', v_variant);
end $$;

create or replace function public.cv_job_fail(
  p_key text, p_item_id uuid, p_error text
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_batch uuid;
begin
  perform canvas.assert_key(p_key);
  update canvas.batch_items set status = 'failed', finished_at = now(), error = p_error
  where id = p_item_id and status = 'running'
  returning batch_id into v_batch;
  if v_batch is null then raise exception 'cv: item % är inte running', p_item_id; end if;
  perform canvas.batch_done_check(v_batch);
  return jsonb_build_object('ok', true);
end $$;
