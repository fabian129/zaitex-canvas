# Adapter-seamen — motorkontraktet

Canvasen är byggd så att MOTORERNA är utbytbara bakom ett smalt, dokumenterat kontrakt.
I natt är alla motorer mockar. Att koppla Higgsfield/Nano Banana senare är att skruva i en
adapter — ingen annan kod rörs.

## Kontraktet (två halvor)

### 1. DB-halvan: adapter-kön (motoroberoende, redan i drift)
Kön lever i `canvas.batch_items` och styrs av tre verb (alla i prod och lokalt):

| Verb | Roll |
|---|---|
| `cv_job_claim(p_key, p_engine?)` | Claimar nästa köade jobb ATOMISKT (`for update skip locked`) — flera runners kan köra parallellt. Returnerar `{item_id, batch_id, shot_id, project_id, engine, prompt, chain}` där `prompt` är shotens kompilerade promptversion. |
| `cv_job_finish(p_key, p_item_id, p_media_url, p_meta)` | Skriver resultatvarianten (variant-racket), markerar jobbet `succeeded`, flyttar shot → `generated`, stänger batchen när kön är tom. |
| `cv_job_fail(p_key, p_item_id, p_error)` | Markerar `failed` med felet; kön går vidare. |

Grinden sitter FÖRE kön: `cv_batch_create` → `pending_approval`; `cv_batch_approve` verkställer
taket (`cap_max_jobs`) i DB — allt över taket blir `skipped`. Ingen motor ser ett jobb som
inte passerat grinden.

### 2. App-halvan: `EngineAdapter` (TypeScript)
Fil: `src/lib/engines/adapter.ts`

```ts
interface EngineAdapter {
  name: string;                 // matchas mot batches.engine
  kind: "image" | "video";
  generate(job: EngineJob): Promise<EngineResult>;  // kasta Error vid fel
}
```

- `EngineJob` är exakt vad `cv_job_claim` returnerar.
- `EngineResult.mediaUrl`: riktiga adapters laddar upp till storage-bucketen `canvas-media`
  (eller motorns egna CDN-URL) och returnerar publik URL. Mockarna returnerar en
  deterministisk SVG via `/api/mock/render`.
- `EngineResult.meta` persisteras på varianten (modell, seed, kostnad, latens…).
- Idempotens: samma `item_id` kan komma om efter en krasch — en adapter får inte dubbeldebitera
  utan att kolla sin egen journal (mockarna är rena funktioner, riktiga adapters bör logga
  motoranrop i meta).

Runnern (`src/lib/engines/runner.ts`) är den enda konsumenten: claim → `getAdapter(engine)` →
`generate` → finish/fail. Den triggas av UI:t efter godkännande, via `POST /api/runner`
(agenter/cron), och är säker att anropa när som helst.

## Att skruva i en riktig motor (Senare-listan i planen)

1. Skriv adaptern, t.ex. `src/lib/engines/nano-banana.ts`:
   - API-nyckel via env (`NANO_BANANA_API_KEY`) — läses ALDRIG i klientkod.
   - Rendera prompten med dialekten (`renderDialect(core, "nano-banana")` — formatet är
     flaggat OBEVISAT tills bevis-loopen körts, se skill `canvas-bevisloopen`).
   - Ladda upp resultatet till `canvas-media`, returnera publik URL + meta.
2. Registrera en rad i `src/lib/engines/registry.ts`:
   ```ts
   "nano-banana": nanoBananaAdapter,
   ```
3. Lägg motornamnet i UI-listorna (`BatchPanel`/`ProjectCanvas` engine-select + `ENGINE_HINTS`
   i `PromptPanel`).
4. Tryck igång bevis-loopen (skill `canvas-bevisloopen`): A/B-batcher per hypotes, blind
   kurering, bevisrader in i skill-drafts.

Higgsfield via MCP: samma seam — adaptern pratar MCP i stället för HTTP, kön och kontraktet
är oförändrade.

## Varför seamen ser ut så här
- **Kön i DB, inte i processen:** jobben överlever processdöd; flera runners (cloud + VPS)
  kan tömma samma kö; `skip locked` gör claim atomiskt.
- **Prompten kompileras före kön:** motorn får text + kedja, aldrig levande objekt — 
  prompt-hjärnan kan bytas utan att röra motorer, och tvärtom.
- **Grinden är DB-mekanik:** taket kan inte kringgås från UI eller adapter.
