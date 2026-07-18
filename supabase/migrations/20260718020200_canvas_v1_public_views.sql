-- Publika läs-vyer (husmönstret): security_invoker=on => RLS på bastabellerna gäller.
-- ENDAST select grantas (kända grindkortet om publika vyers skrivrätt undviks).
-- Identisk med prod-migrationen canvas_v1_public_views.
create view public.cv_projects with (security_invoker=on) as select * from canvas.projects;
create view public.cv_scenes with (security_invoker=on) as select * from canvas.scenes;
create view public.cv_shots with (security_invoker=on) as select * from canvas.shots;
create view public.cv_variants with (security_invoker=on) as select * from canvas.variants;
create view public.cv_souls with (security_invoker=on) as select * from canvas.souls;
create view public.cv_shot_souls with (security_invoker=on) as select * from canvas.shot_souls;
create view public.cv_prompt_versions with (security_invoker=on) as select * from canvas.prompt_versions;
create view public.cv_batches with (security_invoker=on) as select * from canvas.batches;
create view public.cv_batch_items with (security_invoker=on) as select * from canvas.batch_items;

revoke all on public.cv_projects, public.cv_scenes, public.cv_shots, public.cv_variants,
  public.cv_souls, public.cv_shot_souls, public.cv_prompt_versions, public.cv_batches,
  public.cv_batch_items from anon, authenticated;
grant select on public.cv_projects, public.cv_scenes, public.cv_shots, public.cv_variants,
  public.cv_souls, public.cv_shot_souls, public.cv_prompt_versions, public.cv_batches,
  public.cv_batch_items to anon, authenticated, service_role;
