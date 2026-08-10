-- MÖNSTERJAKTEN (Fabians dom 10 aug): canvasen får SYFTE och RUNDOR.
-- (1) Ett moodboard vet vad det är till för (syfte): mönsterjakt (hög & bred referensjakt),
--     färg & bildspråk, layout — i stället för en allmän hög. Rum med syften är samma lag
--     som fas-kartan i web_ramverk_prototypfasen_v1: friheten bor inne i rummet.
-- (2) Rundor appendas i SAMMA hög (items bär rond) i stället för ett nytt bräde per rond —
--     högen växer och man författar ovanpå. cv_mood_intake utan p_rond landar i senaste ronden,
--     så agenter behöver inte veta rundräkningen; en ny rond startas med explicit p_rond.

alter table canvas.moodboards add column if not exists syfte text not null default 'mood';
alter table canvas.moodboards add constraint moodboards_syfte_check
  check (syfte in ('mood','monsterjakt','farg-bildsprak','layout'));

alter table canvas.moodboard_items add column if not exists rond integer not null default 1;
create index if not exists moodboard_items_rond_idx on canvas.moodboard_items (moodboard_id, rond);

-- Vyerna är select * — återskapas så de bär de nya kolumnerna (läggs sist → replace ok).
-- Grants på vyerna överlever replace (v4:s läge: select till anon/authenticated/service_role).
create or replace view public.cv_moodboards with (security_invoker=on) as
  select * from canvas.moodboards;
create or replace view public.cv_moodboard_items with (security_invoker=on) as
  select * from canvas.moodboard_items;

-- Nya signaturer kräver drop + create (create or replace kan inte byta signatur, och en
-- overload hade gjort rpc-anropen tvetydiga). Grantsen sätts om explicit efteråt eftersom
-- drop tappar dem och nya funktioner annars får PUBLIC-EXECUTE (Postgres-default).

drop function public.cv_moodboard_create(text, text, uuid, uuid, uuid, text);
create function public.cv_moodboard_create(
  p_key text, p_title text, p_client_id uuid default null,
  p_project_id uuid default null, p_content_item_id uuid default null, p_note text default null,
  p_syfte text default 'mood'
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid;
begin
  perform canvas.assert_key(p_key);
  if coalesce(p_syfte,'mood') not in ('mood','monsterjakt','farg-bildsprak','layout') then
    raise exception 'cv: okänt syfte % — giltiga: mood, monsterjakt, farg-bildsprak, layout', p_syfte;
  end if;
  insert into canvas.moodboards (title, client_id, project_id, content_item_id, note, syfte)
  values (p_title, p_client_id, p_project_id, p_content_item_id, p_note, coalesce(p_syfte,'mood'))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'syfte', coalesce(p_syfte,'mood'));
end $$;

drop function public.cv_mood_intake(text, uuid, text, text, text, text, text, jsonb);
create function public.cv_mood_intake(
  p_key text, p_moodboard_id uuid, p_media_url text default null,
  p_kind text default 'image', p_title text default null, p_caption text default null,
  p_source text default 'agent', p_meta jsonb default '{}'::jsonb,
  p_rond integer default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid; v_pos real; v_rond int;
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
  if p_rond is not null and p_rond < 1 then
    raise exception 'cv: rond måste vara >= 1';
  end if;
  -- Utan p_rond: landa i brädets senaste rond — högen växer, inget nytt bräde per runda.
  select coalesce(p_rond, coalesce(max(rond), 1)) into v_rond
  from canvas.moodboard_items where moodboard_id = p_moodboard_id;
  select coalesce(max(position),0)+1 into v_pos
  from canvas.moodboard_items where moodboard_id = p_moodboard_id;
  insert into canvas.moodboard_items (moodboard_id, kind, media_url, title, caption, source, position, meta, rond)
  values (p_moodboard_id, coalesce(p_kind,'image'), nullif(p_media_url,''), p_title, p_caption,
          coalesce(p_source,'agent'), v_pos, coalesce(p_meta,'{}'::jsonb), v_rond)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rond', v_rond);
end $$;

-- Rättigheterna speglar dagens läge exakt: enbart service_role (verbnyckeln är andra grinden).
revoke execute on function public.cv_moodboard_create(text,text,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.cv_moodboard_create(text,text,uuid,uuid,uuid,text,text) to service_role;
revoke execute on function public.cv_mood_intake(text,uuid,text,text,text,text,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.cv_mood_intake(text,uuid,text,text,text,text,text,jsonb,integer) to service_role;
