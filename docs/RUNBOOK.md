# Runbook — Zaitex Canvas

## Arkitekturen i en mening
Next-app (UI + API-routes) ↔ Supabase (schema `canvas`): läsning via publika `cv_*`-vyer
(RLS, endast select), skrivning ENBART via `cv_*`-verb (security definer + verb-nyckel i
`canvas.app_config`), liveness via Realtime-publikationen (fallback: SSE-brygga → polling),
motorer bakom adapter-seamen (`docs/ADAPTER_SEAM.md`) — mockar i natt.

## Drift
- **Starta mot prod:** `.env.production.example` → `.env.local`, `npm run dev` (eller `npm run build && npm start`).
- **Kö-tick:** `POST /api/runner {"max":50}` — idempotent, säkert från cron/agent. UI:t
  sparkar den själv efter batch-godkännande.
- **Verb-nyckeln:** `select value from canvas.app_config where key='verb_key';` (endast
  postgres-rollen kan läsa — inga grants till anon/authenticated/service_role).
- **Nyckelrotation:** `update canvas.app_config set value='<ny>' where key='verb_key';` +
  uppdatera `CANVAS_VERB_KEY` i appens env. Verben slutar svara med gamla nyckeln direkt.
- **E2E-vakt:** `npm run e2e` (kräver `npm run local-stack` första gången i miljöer utan egress).

## Felsökning
| Symptom | Trolig orsak | Åtgärd |
|---|---|---|
| Statuschipen visar `polling` | Websocket + SSE-brygga onåbara | Fungerar ändå (5 s). Kolla brandvägg/egress; bryggan kräver `CANVAS_LOCAL_PG_URL` |
| `cv: ogiltig verb-nyckel` | Fel/roterad nyckel | Hämta nyckeln ur `canvas.app_config`, uppdatera env |
| Batch fastnar i `kör` | Runner dog mitt i jobb | `POST /api/runner` igen — claim är `skip locked`; item i `running` utan runner: sätt tillbaka till `queued` manuellt |
| Jobb `failed: ingen adapter registrerad` | `batches.engine` saknar adapter | Registrera i `src/lib/engines/registry.ts` |
| Bilder 404 i lokal-läget | `public/uploads` rensad | Ta in bilderna igen (trayn); mockrenders är URL-deterministiska och läker själva |

## Kända avsteg i natt (sandbox-fakta, inte produktbeslut)
- **Cloud-sandboxens egress-policy blockerar `*.supabase.co`** (403 på CONNECT — även REST).
  Därför kördes browser-beviset mot den lokala bevis-stacken (embedded Postgres + samma
  migrationer + seed) med SSE-bryggan som liveness (riktig DB-push via LISTEN/NOTIFY, 847 ms
  DB-rad→UI i beviset). Supabase Realtime-vägen är komplett på riktiga sidan: publikationen,
  RLS-läspolicyer och klientkoden är på plats i prod — men **osedd i browser i natt**; första
  körning mot prod utanför sandboxen verifierar chipen `● live`.
- Docker-registryernas blob-CDN:er är också blockerade — därför embedded Postgres i stället
  för `supabase start` lokalt.

## Härdningslista (före kundexponering — förslag, inte gjort)
1. **Klient-scopa läsningen:** `cv_read`-policyerna är `using (true)` (hela canvas-ytan är
   läsbar med anon-nyckeln). Byt till klient-scopade policyer + auth när canvasen får
   kundinloggning (klient-scopingen finns redan som kolumner: `projects.client_id`).
2. **Rate-limit på API-routes** (`/api/intake`, `/api/upload`, `/api/runner`) — idag ogatade
   mot missbruk av själva appservern (verben kräver nyckel, men routes bär nyckeln åt anropare).
3. **Storage-städning:** `canvas-media` är publik bucket med anon-insert-policy (scopat till
   bucketen). Lägg TTL/kvot + flytta insert bakom service-nyckel när sådan finns i appmiljön.
4. **`app_config`-åtkomst:** verifierad utan grants; håll det så (Städarens grindkort-klass).
5. Supabase security-advisors 2026-07-18: **0 fynd på canvas-ytan** (baseline att hålla).

## Prototypen
`studio.canvas_projects`/`studio.canvas_items` (read-only-visaren) är ORÖRD. Canvasen
relaterar till `studio.content_items`/`content_plans` via FK — inga parallellstrukturer.
