-- LOKAL DEV-SEED (körs bara av `supabase start`/`db reset` — aldrig i prod).
-- Fast verb-nyckel för lokal utveckling + storage-bucket + demo-projektet.

update canvas.app_config set value = 'lokal-dev-verbnyckel-byt-aldrig-i-prod' where key = 'verb_key';

insert into storage.buckets (id, name, public) values ('canvas-media','canvas-media', true)
on conflict (id) do nothing;

drop policy if exists "canvas_media_upload" on storage.objects;
create policy "canvas_media_upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'canvas-media');

-- Stub-rader med SAMMA id:n som prod (Zaitex-klienten + content-planen) så
-- demo-projektets kopplingar ser likadana ut lokalt.
insert into leverans.clients (id, name)
values ('3b7f968b-f7fb-451f-857d-2ef2582c6578', 'Zaitex')
on conflict (id) do nothing;

insert into studio.content_plans (id, client_id, campaign_name, status)
values ('19599372-1f10-4301-ba99-c44b79f141be', '3b7f968b-f7fb-451f-857d-2ef2582c6578',
        'Zaitex Launch — Organic Growth v2', 'active')
on conflict (id) do nothing;

-- Studio-kopplingens demo-item (lokal stubb): /from-item/<id> öppnar/skapar dess storyboard
insert into studio.content_items (id, client_id, content_plan_id, platform, content_type, title, hook, caption, status)
values ('c0417e57-0000-4000-8000-000000000001', '3b7f968b-f7fb-451f-857d-2ef2582c6578',
        '19599372-1f10-4301-ba99-c44b79f141be', 'reels', 'video',
        'Zaitex — produktreel (studio-item)',
        'Hooken: tre sekunder rakt in i maskinhallen', 'Caption-utkast från studio', 'idea')
on conflict (id) do nothing;

-- Demo-projektet (samma innehåll som seedades i prod via verben)
do $$
declare
  k text := (select value from canvas.app_config where key='verb_key');
  proj uuid; sc1 uuid; sc2 uuid; sc3 uuid;
  sh uuid; s_grundaren uuid; s_fabriken uuid;
  r jsonb;
begin
  r := public.cv_project_create(k, 'Zaitex — lanserings-storyboard (demo)',
        '3b7f968b-f7fb-451f-857d-2ef2582c6578'::uuid,
        '19599372-1f10-4301-ba99-c44b79f141be'::uuid, null, '16:9',
        'Demo-projekt för kedjeflödet: intag → kedja → batchgrind → mock-motor → kurering → export.');
  proj := (r->>'id')::uuid;

  r := public.cv_scene_add(k, proj, 'Hook', 'hook');        sc1 := (r->>'id')::uuid;
  r := public.cv_scene_add(k, proj, 'Bevis', 'bygg');       sc2 := (r->>'id')::uuid;
  r := public.cv_scene_add(k, proj, 'CTA', 'avslut');       sc3 := (r->>'id')::uuid;

  r := public.cv_shot_add(k, sc1, 'Öppning: maskinhallen', 'Vidbild av tom industrihall som vaknar, damm i ljusstrålar', 'wide, låg höjd', 'gryningsljus genom takfönster', 'långsam dolly framåt', 2.5);
  r := public.cv_shot_add(k, sc1, 'Grundaren kliver in', 'Grundaren går in i bild, beslutsamt tempo', 'medium tracking', 'sidoljus, hårda skuggor', 'tracking höger', 3.0);
  r := public.cv_shot_add(k, sc2, 'Produkten i drift', 'Närbild på produkten som används, precisionskänsla', 'macro close-up', 'mjukt toppljus', 'subtil rack focus', 3.5);
  r := public.cv_shot_add(k, sc2, 'Resultatet', 'Kunden ser resultatet, äkta reaktion', 'over-shoulder', 'varmt kvällsljus', 'statisk', 2.5);
  r := public.cv_shot_add(k, sc3, 'Logotyp-avslut', 'Zaitex-logotypen växer fram ur mörker', 'centrerad', 'logotyp självlysande', 'långsam zoom ut', 2.0);

  r := public.cv_soul_upsert(k, 'grundaren', 'Grundaren', 'character',
        'nordisk man i 30-årsåldern, kort mörkt hår, svart t-shirt, målmedveten blick, samma ansikte i varje bild',
        'kostym, glasögon, leende mot kamera', 'Zaitex grundare — bärande karaktär i lanseringsmaterialet',
        '{}', '3b7f968b-f7fb-451f-857d-2ef2582c6578'::uuid);
  s_grundaren := (r->>'id')::uuid;
  r := public.cv_soul_upsert(k, 'fabriken', 'Fabriken', 'place',
        'rå industrihall med betonggolv, stora takfönster, dammpartiklar i ljusstrålarna, kallt stål mot varmt ljus',
        'kontorsmiljö, människomassor', 'Återkommande miljö — hallen där allt byggs', '{}', null);
  s_fabriken := (r->>'id')::uuid;

  select id into sh from canvas.shots where scene_id = sc1 and title = 'Grundaren kliver in';
  perform public.cv_shot_soul_link(k, sh, s_grundaren, 'subject');
  perform public.cv_shot_soul_link(k, sh, s_fabriken, 'location');
  select id into sh from canvas.shots where scene_id = sc1 and title = 'Öppning: maskinhallen';
  perform public.cv_shot_soul_link(k, sh, s_fabriken, 'location');

  -- agent-intag via DB-rad (variant-rack-mönstret): en i trayn, en på en shot
  perform public.cv_intake(k, proj, '/api/mock/render?seed=424242&engine=agent-intag&kind=image&prompt=referensbild%20fr%C3%A5n%20agent%20(tray)', null, 'agent', 'referens: ljussättning för hallen');
  perform public.cv_intake(k, proj, '/api/mock/render?seed=131313&engine=agent-intag&kind=image&prompt=referens%20direkt%20p%C3%A5%20shoten', sh, 'agent', 'referens: kompositionsförslag för öppningen');
end $$;
