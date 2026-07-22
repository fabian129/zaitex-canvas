-- STUDIO-KOPPLINGEN (mergen med studio, funktionellt): smala läsvyer så canvasen
-- kan föda projekt ur riktiga klienter/planer/items och studio kan deep-linka in.
-- Vyerna läser med ägarens rättigheter (ingen security_invoker) så studio-schemats
-- egna RLS-policyer inte behöver röras — exponerar ENDAST id/namn/titel/status-fält.
-- Härdning före kundexponering: klient-scopa tillsammans med cv_read-policyerna.
create view public.cv_clients as
  select id, name from leverans.clients;
create view public.cv_content_plans as
  select id, client_id, campaign_name, month, status
  from studio.content_plans
  where deleted_at is null;
create view public.cv_content_items as
  select id, client_id, content_plan_id, platform, content_type, title, status, hook, caption
  from studio.content_items
  where deleted_at is null;

revoke all on public.cv_clients, public.cv_content_plans, public.cv_content_items
  from anon, authenticated;
grant select on public.cv_clients, public.cv_content_plans, public.cv_content_items
  to anon, authenticated, service_role;
