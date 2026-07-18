# Adapter-seamen — motorkontraktet

Canvasen är byggd så att MOTORERNA är utbytbara bakom ett smalt, dokumenterat kontrakt.
Alla motorer är mockar tills nycklar finns. Att koppla Higgsfield/Nano Banana/fal.ai
senare är att skruva i en adapter — ingen annan kod rörs.

## Kontraktet (två halvor)

### 1. DB-halvan: adapter-kön (motoroberoende, redan i drift)
Kön lever i `canvas.batch_items` och styrs av verben (alla i prod och lokalt):

| Verb | Roll |
|---|---|
| `cv_job_claim(p_key, p_engine?)` | Claimar nästa köade jobb ATOMISKT (`for update skip locked`) — flera runners kan köra parallellt. Returnerar `{item_id, batch_id, shot_id, project_id, engine, prompt, chain, camera_presets, refs}` där `prompt` är shotens kompilerade promptversion och `refs` är de typade referens-slotsen (Popcorn-mönstret). |
| `cv_job_finish(p_key, p_item_id, p_media_url, p_meta)` | SYNC-vägen: skriver resultatvarianten (variant-racket), markerar jobbet `succeeded`, flyttar shot → `generated`, stänger batchen när kön är tom. |
| `cv_job_fail(p_key, p_item_id, p_error)` | Markerar `failed` med felet (running ELLER dispatched); kön går vidare. |
| `cv_job_dispatch(p_key, p_item_id, p_external_job_id?)` | ASYNC-vägen: running → `dispatched`. Genererar per-jobb-callback-token — returneras EN gång, DB lagrar bara sha256-hashen (läcker aldrig via vyer/Realtime). |
| `cv_job_callback(p_key, p_item_id, p_token, p_status, p_media_url?, p_meta?, p_error?, p_external_job_id?)` | Motorns webhook (via `POST /api/engine-callback`). Token-verifierad (hash), IDEMPOTENT: retries/dubbletter på avslutade jobb är no-op (`ok/already`) — fal-semantik. `succeeded` skriver varianten precis som `cv_job_finish`. |

Grinden sitter FÖRE kön: `cv_batch_create` → `pending_approval`; `cv_batch_approve` verkställer
TVÅ tak i DB — `cap_max_jobs` (antal) och `cap_max_cost` (kumulativ kostnad i kostnadsenheter,
per-motor-priser i `canvas.engine_costs`). Allt över något av taken blir `skipped` med
orsaken i `error`. Ingen motor ser ett jobb som inte passerat grinden.

### 2. App-halvan: `EngineAdapter` (TypeScript)
Fil: `src/lib/engines/adapter.ts`

```ts
interface EngineAdapter {
  name: string;                 // matchas mot batches.engine
  kind: "image" | "video";
  // EXAKT en av dessa:
  generate?(job: EngineJob): Promise<EngineResult>;  // SYNC — svar i samma anrop
  dispatch?(job: EngineJob, callback: EngineCallback): Promise<{ externalJobId?: string }>;
                                                     // ASYNC — webhook stänger jobbet
}
```

- `EngineJob` är exakt vad `cv_job_claim` returnerar (inkl. `camera_presets` + `refs` —
  adapters med native preset/referens-stöd använder dem direkt i stället för prompttexten).
- `EngineResult.mediaUrl`: riktiga adapters laddar upp till storage-bucketen `canvas-media`
  (eller motorns egna CDN-URL) och returnerar publik URL. Mockarna returnerar en
  deterministisk SVG via `/api/mock/render`.
- `EngineResult.meta` persisteras på varianten (modell, seed, kostnad, latens…).
- ASYNC: `dispatch` får `{url, token, item_id}` — skicka till motorn som webhook-mål
  (Higgsfield `X-Webhook-URL`, fal.ai queue-webhooks). Motorn POST:ar tillbaka
  `{item_id, token, status, media_url?, meta?, error?, external_job_id?}` till
  `<CANVAS_PUBLIC_URL>/api/engine-callback`. Mottagaren är idempotent; ogiltig token → 403.
- Idempotens: samma `item_id` kan komma om efter en krasch — en adapter får inte dubbeldebitera
  utan att kolla sin egen journal (mockarna är rena funktioner, riktiga adapters bör logga
  motoranrop i meta).

Runnern (`src/lib/engines/runner.ts`) är den enda konsumenten:
claim → `getAdapter(engine)` → SYNC: `generate` → finish/fail · ASYNC: `cv_job_dispatch` →
`dispatch(job, callback)` → (webhooken stänger jobbet senare). Den triggas av UI:t efter
godkännande, via `POST /api/runner` (agenter/cron), och är säker att anropa när som helst.

## Att skruva i en riktig motor (Senare-listan i planen)

1. Skriv adaptern, t.ex. `src/lib/engines/nano-banana.ts` (sync) eller
   `src/lib/engines/fal.ts` (async — implementera `dispatch`):
   - API-nyckel via env (`NANO_BANANA_API_KEY`, `FAL_KEY`…) — läses ALDRIG i klientkod.
   - Rendera prompten med dialekten (`renderDialect(core, "nano-banana")` — formatet är
     flaggat OBEVISAT tills bevis-loopen körts, se skill `canvas-bevisloopen`).
   - Sync: ladda upp resultatet till `canvas-media`, returnera publik URL + meta.
   - Async: skicka callback-URL + token som webhook-mål; motorns svar landar i
     `/api/engine-callback`. Sätt `CANVAS_PUBLIC_URL` så motorn når appen utifrån.
2. Registrera en rad i `src/lib/engines/registry.ts`:
   ```ts
   "nano-banana": nanoBananaAdapter,
   ```
3. Lägg motornamnet i UI-listorna (`ProjectCanvas` engine-select + `ENGINE_HINTS`
   i `PromptPanel`) och en rad i `canvas.engine_costs` (kostnadstaket räknar med den).
4. Tryck igång bevis-loopen (skill `canvas-bevisloopen`): A/B-batcher per hypotes, blind
   kurering, bevisrader in i skill-drafts.

Higgsfield via MCP: samma seam — adaptern pratar MCP i stället för HTTP, kön och kontraktet
är oförändrade. Async-mönstret är bevisat med `mock-higgsfield-async` (e2e-steg 7c:
dispatched → callback → klar, dubblettskydd verifierat).

## Varför seamen ser ut så här
- **Kön i DB, inte i processen:** jobben överlever processdöd; flera runners (cloud + VPS)
  kan tömma samma kö; `skip locked` gör claim atomiskt. `dispatched`-jobb överlever
  också processdöd — callbacken kan landa i vilken instans som helst.
- **Prompten kompileras före kön:** motorn får text + kedja + typade refs/presets,
  aldrig levande objekt — prompt-hjärnan kan bytas utan att röra motorer, och tvärtom.
- **Grinden är DB-mekanik:** varken jobbtaket eller kostnadstaket kan kringgås från UI
  eller adapter; kostnaden stämplas per item vid batch-skapandet (`engine_costs`).
- **Callback-token per jobb, bara hash i DB:** motorn autentiserar sig utan att någonsin
  se verb-nyckeln; läckta läsvyer/Realtime-events avslöjar inget användbart.
