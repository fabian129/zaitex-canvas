-- DB-push via LISTEN/NOTIFY: varje skrivning i canvas-schemat notifierar 'canvas_changed'.
-- Används av SSE-bryggan (/api/dev-events) som liveness-fallback i miljöer där
-- Supabase Realtime-socketen inte går att öppna (t.ex. brandväggade sandboxar).
-- I prod är detta harmlöst (pg_notify är billigt) och Supabase Realtime är primärvägen.

create or replace function canvas.tg_notify() returns trigger
language plpgsql security definer set search_path = canvas, pg_temp as $$
begin
  perform pg_notify('canvas_changed', json_build_object(
    'table', tg_table_name,
    'op', tg_op
  )::text);
  return null;
end $$;

create trigger notify_change after insert or update or delete on canvas.projects
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.scenes
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.shots
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.variants
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.souls
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.shot_souls
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.prompt_versions
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.batches
  for each statement execute function canvas.tg_notify();
create trigger notify_change after insert or update or delete on canvas.batch_items
  for each statement execute function canvas.tg_notify();
