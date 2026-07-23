-- MOODBOARDS (prototyp-ytan): allt som rör design går genom canvasen.
-- Moodboards samlar kurerat material — bilder, video, länkar, embeds, notiser
-- och hela webbkomponenter (uppladdad HTML renderas sandboxat i brädet) —
-- från vilken källa som helst: manuellt, agenter, Stitch MCP, Paper, Pencil.
-- Intagsseamen är samma som variant-racket: verb med nyckel, så externa verktyg
-- (via agent/MCP) skjuter in kurerade saker med cv_mood_intake och de dyker upp live.
-- Kurerat material promotas vidare (cv_mood_promote) — biblioteket i studio läser
-- promotade items ur cv_moodboard_items (promoted_at is not null).
-- Ett moodboard kan hänga fritt, på en klient, på ett canvas-projekt eller ett studio-item.

create table canvas.moodboards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_id uuid,
  project_id uuid references canvas.projects(id) on delete set null,
  content_item_id uuid,
  note text,
  status text not null default 'active' check (status in ('active','archived')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table canvas.moodboard_items (
  id uuid primary key default gen_random_uuid(),
  moodboard_id uuid not null references canvas.moodboards(id) on delete cascade,
  -- html = uppladdad webbkomponent/prototyp (renderas i sandboxad iframe),
  -- embed = extern levande URL i iframe, link = ren länk, note = textkort
  kind text not null default 'image' check (kind in ('image','video','link','embed','html','note')),
  -- note-kind bär sin text i title/caption; alla andra kinds kräver en URL
  media_url text check (kind = 'note' or media_url is not null),
  title text,
  caption text,
  source text not null default 'manual',
  status text not null default 'new' check (status in ('new','kept','rejected')),
  -- promoteringsseamen mot studios bibliotek: stämplas av cv_mood_promote
  promoted_at timestamptz,
  promoted_to text,
  position real not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on canvas.moodboard_items (moodboard_id, position);
create index on canvas.moodboards (client_id);
create index on canvas.moodboards (project_id);

create trigger touch before update on canvas.moodboards for each row execute function canvas.tg_touch();
create trigger touch before update on canvas.moodboard_items for each row execute function canvas.tg_touch();
create trigger notify_change after insert or update or delete on canvas.moodboards
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.moodboard_items
  for each statement execute function canvas.tg_notify();

alter table canvas.moodboards enable row level security;
alter table canvas.moodboard_items enable row level security;
grant select on canvas.moodboards, canvas.moodboard_items to anon, authenticated, service_role;
create policy cv_read on canvas.moodboards for select to anon, authenticated using (true);
create policy cv_read on canvas.moodboard_items for select to anon, authenticated using (true);

create view public.cv_moodboards with (security_invoker=on) as select * from canvas.moodboards;
create view public.cv_moodboard_items with (security_invoker=on) as select * from canvas.moodboard_items;
revoke all on public.cv_moodboards, public.cv_moodboard_items from anon, authenticated;
grant select on public.cv_moodboards, public.cv_moodboard_items
  to anon, authenticated, service_role;

alter publication supabase_realtime add table canvas.moodboards, canvas.moodboard_items;

-- ============ VERB ============

create or replace function public.cv_moodboard_create(
  p_key text, p_title text, p_client_id uuid default null,
  p_project_id uuid default null, p_content_item_id uuid default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid;
begin
  perform canvas.assert_key(p_key);
  insert into canvas.moodboards (title, client_id, project_id, content_item_id, note)
  values (p_title, p_client_id, p_project_id, p_content_item_id, p_note)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.cv_moodboard_set(
  p_key text, p_moodboard_id uuid, p_title text default null,
  p_note text default null, p_status text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.moodboards set
    title = coalesce(p_title, title),
    note = coalesce(p_note, note),
    status = coalesce(p_status, status)
  where id = p_moodboard_id;
  return jsonb_build_object('ok', found, 'id', p_moodboard_id);
end $$;

-- INTAGSSEAMEN för externa verktyg: agenter/Stitch/Paper/Pencil kurerar och
-- skjuter in via detta verb — samma mönster som cv_intake för variant-racket.
create or replace function public.cv_mood_intake(
  p_key text, p_moodboard_id uuid, p_media_url text default null,
  p_kind text default 'image', p_title text default null, p_caption text default null,
  p_source text default 'agent', p_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid; v_pos real;
begin
  perform canvas.assert_key(p_key);
  if not exists (select 1 from canvas.moodboards where id = p_moodboard_id) then
    raise exception 'cv: okänt moodboard %', p_moodboard_id;
  end if;
  if coalesce(p_kind,'image') = 'note' and coalesce(nullif(p_title,''), nullif(p_caption,'')) is null then
    raise exception 'cv: note-item kräver title eller caption';
  end if;
  if coalesce(p_kind,'image') <> 'note' and nullif(p_media_url,'') is null then
    raise exception 'cv: %-item kräver media_url', coalesce(p_kind,'image');
  end if;
  select coalesce(max(position),0)+1 into v_pos
  from canvas.moodboard_items where moodboard_id = p_moodboard_id;
  insert into canvas.moodboard_items (moodboard_id, kind, media_url, title, caption, source, position, meta)
  values (p_moodboard_id, coalesce(p_kind,'image'), nullif(p_media_url,''), p_title, p_caption,
          coalesce(p_source,'agent'), v_pos, coalesce(p_meta,'{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.cv_mood_curate(
  p_key text, p_item_id uuid, p_status text default null,
  p_title text default null, p_caption text default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.moodboard_items set
    status = coalesce(p_status, status),
    title = coalesce(p_title, title),
    caption = coalesce(p_caption, caption)
  where id = p_item_id;
  return jsonb_build_object('ok', found, 'id', p_item_id);
end $$;

-- PROMOTERING: kurerat material går vidare till biblioteket i studio.
-- Promotering innebär keep (slop promotas inte). Studio-sidan läser
-- cv_moodboard_items where promoted_at is not null (+ promoted_to som mål-etikett).
create or replace function public.cv_mood_promote(
  p_key text, p_item_id uuid, p_target text default 'bibliotek'
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.moodboard_items set
    status = 'kept',
    promoted_at = now(),
    promoted_to = coalesce(p_target,'bibliotek')
  where id = p_item_id;
  return jsonb_build_object('ok', found, 'id', p_item_id, 'target', coalesce(p_target,'bibliotek'));
end $$;

create or replace function public.cv_mood_reorder(
  p_key text, p_moodboard_id uuid, p_item_ids uuid[]
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare i int;
begin
  perform canvas.assert_key(p_key);
  for i in 1..coalesce(array_length(p_item_ids,1),0) loop
    update canvas.moodboard_items set position = i-1
    where id = p_item_ids[i] and moodboard_id = p_moodboard_id;
  end loop;
  return jsonb_build_object('ok', true, 'count', coalesce(array_length(p_item_ids,1),0));
end $$;

-- cv_remove utökas med moodboard-kinds (fullständig ersättning av v1-versionen)
create or replace function public.cv_remove(
  p_key text, p_kind text, p_id uuid
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  case p_kind
    when 'project'   then delete from canvas.projects where id = p_id;
    when 'scene'     then delete from canvas.scenes where id = p_id;
    when 'shot'      then delete from canvas.shots where id = p_id;
    when 'variant'   then delete from canvas.variants where id = p_id;
    when 'soul'      then delete from canvas.souls where id = p_id;
    when 'moodboard' then delete from canvas.moodboards where id = p_id;
    when 'mood_item' then delete from canvas.moodboard_items where id = p_id;
    else raise exception 'cv: okänd kind %', p_kind;
  end case;
  return jsonb_build_object('ok', found, 'kind', p_kind, 'id', p_id);
end $$;
