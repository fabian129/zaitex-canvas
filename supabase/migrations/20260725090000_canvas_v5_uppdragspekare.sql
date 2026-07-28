-- Canvas v5 — uppdrags-pekaren (rums-nyckeln, steg 19 på Studio-brädet)
--
-- Domen: rummet har två nivåer. Kunden är rummet, uppdraget är spåret.
-- Riktning (moodboard, brandbible, sparat) hör till KUNDEN.
-- Prototyper, bygge och live-adress hör till UPPDRAGET.
--
-- Canvasen betjänar båda nivåerna, därför är pekaren VALFRI:
--   en moodboard är riktning        -> bara client_id, ingen uppdrags-pekare
--   en produktbild till en sajt     -> delivery_project_id satt, så bilden vet vilken kodbas den ska till
--
-- Namnet är delivery_project_id, INTE project_id, med flit: inuti schemat canvas
-- betyder project_id redan "canvas.projects.id" (scenes, shots, batches, variants pekar dit).
-- Systemet har tre olika "projects" och den tysta förväxlingen är ett verkligt fel — se
-- apps/zaitex-studio/docs/STUDIO-RUMSNYCKELN.md.

-- ── 1. Uppdrags-pekaren på canvas-projektet ─────────────────────────────────
alter table canvas.projects
  add column if not exists delivery_project_id uuid
  references leverans.projects(id) on delete set null;

comment on column canvas.projects.delivery_project_id is
  'Valfri pekare till kundens uppdrag (leverans.projects). Satt = produktion för en specifik sajt/leverans. Null = riktning, hör bara till kunden.';

create index if not exists projects_delivery_project_id_idx
  on canvas.projects (delivery_project_id) where delivery_project_id is not null;

-- ── 2. Det saknade villkoret på moodboardens kund ───────────────────────────
-- client_id var ett löst uuid utan skydd: en moodboard kunde peka på en kund som inte finns.
-- Verifierat före körning: 0 föräldralösa rader, villkoret går på utan städning.
alter table canvas.moodboards
  drop constraint if exists moodboards_client_id_fkey;
alter table canvas.moodboards
  add constraint moodboards_client_id_fkey
  foreign key (client_id) references leverans.clients(id) on delete set null;

-- ── 3. Läsvyerna exponerar det nya (kolumner läggs SIST — bevarar grants) ───
create or replace view public.cv_projects as
  select id, title, client_id, content_plan_id, content_item_id, format, status, brief, meta,
         created_at, updated_at, delivery_project_id
  from canvas.projects;

-- Företagsnamnet fanns hela tiden — vyn exponerade det bara aldrig, så canvasens
-- kundlista visade kontaktpersonens namn (EventPartner hette "Pontus bredaal hansen").
-- Raderade kunder ska aldrig visas någonstans.
create or replace view public.cv_clients as
  select id, name, company_name
  from leverans.clients
  where deleted_at is null;

-- ── 4. Verben får sätta pekaren (annars är kolumnen dekoration) ─────────────
-- Signaturen ändras => drop före create, annars uppstår en överlagring och anrop
-- med namngivna argument blir tvetydiga. Grants återställs exakt som de var
-- (authenticated, service_role, jarvis_port — anon har aldrig haft skrivrätt här).
drop function if exists public.cv_project_create(text, text, uuid, uuid, uuid, text, text);
create function public.cv_project_create(
  p_key text, p_title text, p_client_id uuid default null,
  p_content_plan_id uuid default null, p_content_item_id uuid default null,
  p_format text default '16:9', p_brief text default null,
  p_delivery_project_id uuid default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
declare v_id uuid;
begin
  perform canvas.assert_key(p_key);
  insert into canvas.projects (title, client_id, content_plan_id, content_item_id, format, brief, delivery_project_id)
  values (p_title, p_client_id, p_content_plan_id, p_content_item_id, coalesce(p_format,'16:9'), p_brief, p_delivery_project_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

drop function if exists public.cv_project_set(text, uuid, text, text, text, text);
create function public.cv_project_set(
  p_key text, p_project_id uuid, p_title text default null, p_status text default null,
  p_format text default null, p_brief text default null,
  p_delivery_project_id uuid default null
) returns jsonb language plpgsql security definer set search_path = canvas, public, pg_temp as $$
begin
  perform canvas.assert_key(p_key);
  update canvas.projects set
    title = coalesce(p_title, title),
    status = coalesce(p_status, status),
    format = coalesce(p_format, format),
    brief = coalesce(p_brief, brief),
    delivery_project_id = coalesce(p_delivery_project_id, delivery_project_id)
  where id = p_project_id;
  return jsonb_build_object('ok', found, 'id', p_project_id);
end $$;

-- OBS: `revoke ... from public` räcker INTE. Supabase har default-privilegier som
-- delar ut EXECUTE till anon och authenticated på varje NY funktion i public — en
-- drop+create återinför alltså anon även om den var borttagen före. Verifierat i
-- skarp drift: anon dök upp i grant-listan efter första körningen. Revoke per roll.
revoke execute on function public.cv_project_create(text, text, uuid, uuid, uuid, text, text, uuid) from public, anon;
revoke execute on function public.cv_project_set(text, uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.cv_project_create(text, text, uuid, uuid, uuid, text, text, uuid) to authenticated, service_role, jarvis_port;
grant execute on function public.cv_project_set(text, uuid, text, text, text, text, uuid) to authenticated, service_role, jarvis_port;
