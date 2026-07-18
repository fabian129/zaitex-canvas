# Intaget — alla vägar in i canvasen

Allt intag landar som rader i `canvas.variants` (variant-rack-mönstret). Utan `shot_id`
hamnar bilden i projektets **intags-tray** och kan sättas på en shot senare; med `shot_id`
landar den direkt i shotens variant-stack. Realtime/bryggan lyfter in raden i UI:t live.

## 1. Agent med DB-åtkomst (rekommenderad för husets agenter)
```sql
select public.cv_intake(
  (select value from canvas.app_config where key='verb_key'),
  '<project_id>'::uuid,
  'https://…/bild.jpg',        -- media_url
  null,                        -- shot_id (null = tray)
  'agent',                     -- source
  'valfri promptanteckning'
);
```

## 2. HTTP-intag (agenter utan DB, t.ex. via curl)
```bash
curl -X POST https://<canvas-host>/api/intake \
  -H 'Content-Type: application/json' \
  -d '{"project_id":"<uuid>","media_url":"https://…","prompt":"anteckning","shot_id":"<uuid, valfri>"}'
```

## 3. URL-pull (servern hämtar och arkiverar bilden)
```bash
curl -X POST https://<canvas-host>/api/intake \
  -H 'Content-Type: application/json' \
  -d '{"project_id":"<uuid>","pull_url":"https://…/bild.jpg"}'
```
Bilden hämtas server-side, läggs i storage-bucketen `canvas-media` (lokal-läget: `public/uploads`)
och intas med `source='url'`. Endast `image/*`/`video/*`, max 15 MB.

## 4. Uppladdning (UI:t eller multipart-POST)
Intag-fliken i canvasen, eller:
```bash
curl -X POST https://<canvas-host>/api/upload \
  -F file=@bild.png -F project_id=<uuid> [-F shot_id=<uuid>]
```

## Kureringsflödet efter intag
Tray → `cv_variant_assign` (sätt på shot) → `cv_variant_curate` (behåll/förkasta + kommentar)
→ `cv_shot_select_variant` (välj shotens huvudbild). Rubriken: skill `canvas-kurerings-rubrik`.
