# Studio-mergen: integrationskontraktet

Canvas ska in i **studio**. Den här filen är överlämningen till agenten som
launchat studio — allt på canvas-sidan är byggt, e2e-bevisat och applicerat i
prod-databasen. Det som återstår är studio-sidans UI-kopplingar, och de listas
här som exakta ytor.

## Grundläget: databasen är redan gemensam

Canvas bor i **samma Supabase-projekt** som studios scheman (`studio.*`,
`leverans.*`). Canvas har ett eget schema (`canvas`) + publika läs-vyer
(`cv_*`, select-only) + skriv-verb (`cv_*`-funktioner, security definer,
gatade med verb-nyckeln i `canvas.app_config`). Inga parallellstrukturer:
canvas läser studios klienter/planer/items via vyerna `cv_clients`,
`cv_content_plans`, `cv_content_items`.

Alla migrationer ligger i `supabase/migrations/` och är applicerade i prod.

## Studio → canvas (ingångar)

1. **Deep-link per content-item:** `GET /from-item/<content_item_id>`
   — öppnar itemets storyboard; finns inget skapas det (kopplat till klient +
   plan + item, format 9:16 för tiktok/reels annars 16:9, brief = hook +
   caption) och användaren landar direkt i brädet. Idempotent (bevisad).
   Studio behöver bara en "Öppna storyboard"-knapp per content-item som
   länkar hit.
2. **Moodboards:** `/m/<moodboard_id>` — prototyp-ytan. Skapas från canvas
   startsida eller via verbet `cv_moodboard_create` (kan kopplas till
   klient/projekt/content-item). Allt design-material går genom canvasen:
   bilder, video, länkar, embeds, notiser och hela HTML-komponenter
   (uppladdade komponentexports renderas sandboxat i brädet).
3. **Startsidan** `/` listar projekt + moodboards, med skapa-formulär som
   scopar mot studios klient → plan → item.

## Canvas → studio (hämtytor)

1. **Biblioteket:** kurerat material promotas med `cv_mood_promote(item_id)`
   → stämplar `promoted_at` + `promoted_to` ('bibliotek'). Studio läser:
   `select * from cv_moodboard_items where promoted_at is not null`.
   Promotering innebär automatiskt status 'kept' — slop promotas inte.
2. **Storyboard-status per item:** `cv_projects` har `content_item_id` —
   studio kan visa "har storyboard" / status / länk per content-item.
3. **Färdiga leveranser:** valda bilder per shot ligger i `cv_variants`
   (status 'kept', `cv_shots.selected_variant_id`); export-vyerna
   (HTML/PDF/jobbfil) finns under `/p/<id>/export`.

## Skrivvägar (för studio eller agenter)

Alla mutationer går via verb (RPC `public.cv_*` med `p_key` = verb-nyckeln),
eller via canvas-appens API-routes (`/api/verbs/<verb>`) som håller nyckeln
server-side. Intagsseamen för externa verktyg (Stitch MCP, Paper, Pencil,
agenter): `cv_mood_intake(p_moodboard_id, p_media_url, p_kind, p_title,
p_caption, p_source)` respektive `cv_intake(...)` för storyboard-trayn.
Uppladdning: `POST /api/upload` med `moodboard_id` (html→sandboxad komponent,
pdf→embed, video/bild) eller `project_id` (storyboard-trayn).

## Deploy-krav för canvas-appen

| Env | Vad |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase-projektet |
| `CANVAS_VERB_KEY` | verb-nyckeln (prod-värdet i `canvas.app_config`) |
| `GEMINI_API_KEY` | riktiga bildmotorn (nano banana); ligger i Supabase Vault (`gemini_api_key`) |
| `CANVAS_PUBLIC_URL` | appens publika adress — krävs för async-motorers webhooks |
| `NANO_BANANA_MODEL` | valfri modell-override (default gemini-2.5-flash-image) |

Async-motorer (Higgsfield/fal.ai) kräver publik deploy innan de kan skruvas i
— seamen är byggd och e2e-bevisad mot mock, se `docs/ADAPTER_SEAM.md`.

## Repo-läget

- Repot har **en** branch: `claude/agent-fabrik-canvas-build-8iei7n` (ingen main).
- e2e: `node scripts/local-stack.mjs` (lokal Postgres) + `npx playwright test`
  — kedjeflödet + moodboardflödet gröna; screenshots i `e2e-bevis/`.
- Runbook: `docs/RUNBOOK.md` · intag: `docs/INTAG.md` · motorseamen:
  `docs/ADAPTER_SEAM.md`.
