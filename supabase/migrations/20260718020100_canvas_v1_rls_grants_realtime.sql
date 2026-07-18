-- RLS: läsning öppen för anon/authenticated (demo-läge; härdning = klient-scopa policyerna).
-- Skrivning sker ENDAST via cv_*-verb (security definer + verb-nyckel) — inga insert/update-policyer.
-- Identisk med prod-migrationen canvas_v1_rls_grants_realtime.
alter table canvas.projects enable row level security;
alter table canvas.scenes enable row level security;
alter table canvas.shots enable row level security;
alter table canvas.variants enable row level security;
alter table canvas.souls enable row level security;
alter table canvas.shot_souls enable row level security;
alter table canvas.prompt_versions enable row level security;
alter table canvas.batches enable row level security;
alter table canvas.batch_items enable row level security;
alter table canvas.app_config enable row level security;

grant usage on schema canvas to anon, authenticated, service_role;
grant select on canvas.projects, canvas.scenes, canvas.shots, canvas.variants,
  canvas.souls, canvas.shot_souls, canvas.prompt_versions, canvas.batches, canvas.batch_items
  to anon, authenticated, service_role;
-- app_config: inga grants alls till anon/authenticated/service_role.

create policy cv_read on canvas.projects for select to anon, authenticated using (true);
create policy cv_read on canvas.scenes for select to anon, authenticated using (true);
create policy cv_read on canvas.shots for select to anon, authenticated using (true);
create policy cv_read on canvas.variants for select to anon, authenticated using (true);
create policy cv_read on canvas.souls for select to anon, authenticated using (true);
create policy cv_read on canvas.shot_souls for select to anon, authenticated using (true);
create policy cv_read on canvas.prompt_versions for select to anon, authenticated using (true);
create policy cv_read on canvas.batches for select to anon, authenticated using (true);
create policy cv_read on canvas.batch_items for select to anon, authenticated using (true);

-- Realtime: intag + motorresultat + kurering + batch-status in i UI:t live
alter publication supabase_realtime add table
  canvas.projects, canvas.scenes, canvas.shots, canvas.variants,
  canvas.souls, canvas.prompt_versions, canvas.batches, canvas.batch_items;
