// ===================================================================
// ADAPTER-SEAMEN — kontraktet mellan canvasen och motorerna.
// Fullständig dokumentation: docs/ADAPTER_SEAM.md
//
// Allt på canvas-sidan (batchgrind, kö, kurering, Realtime) är byggt
// mot DETTA interface. Att koppla en riktig motor (Nano Banana API,
// Higgsfield MCP, fal.ai) = implementera EngineAdapter + registrera i
// registry.ts. Ingen annan kod rörs.
//
// Två lägen:
//   SYNC  — generate(job): motorn svarar i samma anrop (mockar, snabba API:er)
//   ASYNC — dispatch(job, callback): motorn får jobbet + webhook-URL/token
//           och svarar senare via POST /api/engine-callback (Higgsfield
//           X-Webhook-URL, fal.ai queue-webhooks). Kön håller jobbet i
//           status 'dispatched' tills callbacken landar (idempotent).
// En adapter implementerar EXAKT en av generate/dispatch.
// ===================================================================

import { ChainStep } from "@/lib/types";

// Typad referens ur shotens referens-slots (Popcorn-mönstret).
export interface JobRef {
  slot: number;
  role: string;
  media_url: string;
  note: string | null;
}

// Jobbet som cv_job_claim levererar ur kön (redan kompilerad prompt).
export interface EngineJob {
  item_id: string;
  batch_id: string;
  shot_id: string;
  project_id: string;
  engine: string;
  prompt: string;
  chain: ChainStep[];
  // Kamera-presets (id:n ur vokabulären) + typade referenser — adapters
  // som stödjer native presets/refs använder dessa direkt i stället för prompttexten.
  camera_presets: string[];
  refs: JobRef[];
}

export interface EngineResult {
  // URL till resultatet. Mockar: app-relativ SVG. Riktiga adapters:
  // ladda upp till storage-bucketen canvas-media och returnera publik URL.
  mediaUrl: string;
  mediaType?: "image" | "video";
  // Motorns metadata (modell, seed, kostnad, latens...) — persisteras på varianten.
  meta: Record<string, unknown>;
}

// Async-lägets callback-kontrakt: adaptern skickar url+token till motorn
// (t.ex. Higgsfields X-Webhook-URL). Motorn POST:ar tillbaka:
//   { item_id, token, status: "succeeded"|"failed", media_url?, meta?, error?, external_job_id? }
// Token är per-jobb (cv_job_dispatch), DB lagrar bara hashen, dubbletter är no-op.
export interface EngineCallback {
  url: string;
  token: string;
  item_id: string;
}

export interface EngineAdapter {
  // Namnet som batches.engine matchas mot (t.ex. "mock-nano-banana", "nano-banana").
  name: string;
  kind: "image" | "video";
  // SYNC: kör ETT jobb. Kasta Error vid fel — runnern rapporterar via cv_job_fail
  // och kön går vidare. Idempotens: samma item_id kan komma om efter krasch.
  generate?(job: EngineJob): Promise<EngineResult>;
  // ASYNC: skicka jobbet till motorn med callback-info; returnera motorns
  // jobb-id om det finns direkt (annars stämplas det i callbacken).
  // Kasta Error vid submit-fel — runnern felmarkerar via cv_job_fail.
  dispatch?(job: EngineJob, callback: EngineCallback): Promise<{ externalJobId?: string }>;
}
