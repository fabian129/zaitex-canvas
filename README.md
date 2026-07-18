# Zaitex Canvas

Storyboard-canvasen (FÖNSTER 3 i Fable-slutspurten + v2-brädet adhoc-d1ca06d0):
projekt → scener → shots i ordnad grid, variant-rack med kurering, Soul ID:s,
versionerade promptkedjor, batchgrind med tak, intag (agent/URL/uppladdning) och
export — allt live mot DB.

**V2 (motorlandskapets mönster):** kamera-presets med stackning (max 3, Higgsfield-mönstret),
typade referens-slots per shot (max 4: identitet/stil/struktur/kontinuitet, Popcorn-mönstret),
kostnadsbaserat tak i batchgrinden (`canvas.engine_costs` + `cap_max_cost`, verkställs i DB)
och webhook-seamen för asynka motorer (`dispatched` + idempotent `/api/engine-callback`).

**Motorerna är mock-adapters** bakom en dokumenterad seam (`docs/ADAPTER_SEAM.md`).
Prompt-hjärnans skelett ligger som skill-drafts flaggade OBEVISADE i `smedjan.skill_registry`
(`canvas-*`), med bevis-loopens design klar (`canvas-bevisloopen`).

## Stack
- Next 16 (App Router) + React 19 + Tailwind 4 + dnd-kit
- Supabase (Zaitex os): eget schema `canvas`, publika läs-vyer `cv_*`, skriv-verb `cv_*`
  (security definer + verb-nyckel), Realtime-publikation på canvas-tabellerna
- Migrationerna: `supabase/migrations/` (applicerade i prod 2026-07-18)

## Köra mot prod (Zaitex os)
```bash
cp .env.production.example .env.local   # fyll i anon-nyckel + verb-nyckel
npm install && npm run dev              # http://localhost:3000
```
Verb-nyckeln (gatar alla skrivningar): `select value from canvas.app_config where key='verb_key';`

## Köra helt lokalt (bevis-stacken — ingen egress behövs)
```bash
npm install
npm run local-stack   # embedded Postgres :55432 + migrationer + seed (första gången)
npm run dev           # .env.local pekar redan på lokal-läget i det här repot
```
Lokal-läget: REST-shim (`/sb-local/rest/v1`), verb direkt mot Postgres, media under
`public/uploads`, liveness via SSE-bryggan (`/api/dev-events`, DB-push via LISTEN/NOTIFY).

## Liveness-trappan
`live` (Supabase Realtime-websocket) → `live (brygga)` (SSE + pg_notify, för brandväggade
miljöer) → `polling` (5 s). Statuschipen i verktygsraden visar aktivt läge.

## End-to-end-beviset
```bash
npm run e2e   # Playwright: hela kedjeflödet i browsern
```
Kör kedjan: bräde → Realtime-intag via DB-rad → URL-pull → uppladdning → souls +
kamera-presets (stack 2/3) + referens-slot + kompilerad kedja (versionerad) → batchgrind
med jobbtak (3 jobb, tak 2 → 1 skippad) → kostnadstak (3×4 ku, budget 8 → 1 skippad) →
webhook-seamen (async-mock: dispatched → callback → klar, dubblettskydd) → kurering
(välj/förkasta/kommentar) → export (storyboard-HTML + shotlista-JSON med refs/presets) →
drag-omordning. Skärmdumpar: `e2e-bevis/`.

## Dokumentation
- `docs/ADAPTER_SEAM.md` — motorkontraktet + hur riktiga motorer skruvas i
- `docs/RUNBOOK.md` — drift, felsökning, härdningslista
- `docs/INTAG.md` — intagsvägarna (agent/HTTP/URL-pull/uppladdning)

## Relationer i DB (inga parallellstrukturer)
`canvas.projects` FK:ar mot `leverans.clients`, `studio.content_plans`, `studio.content_items`
— storyboards hänger på befintliga klienter/planer/items. Prototypen (`studio.canvas_*`)
är orörd.
