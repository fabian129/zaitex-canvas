// ===================================================================
// ADAPTER-SEAMEN — kontraktet mellan canvasen och motorerna.
// Fullständig dokumentation: docs/ADAPTER_SEAM.md
//
// Allt på canvas-sidan (batchgrind, kö, kurering, Realtime) är byggt
// mot DETTA interface. Att koppla en riktig motor (Nano Banana API,
// Higgsfield MCP) = implementera EngineAdapter + registrera i
// registry.ts. Ingen annan kod rörs.
// ===================================================================

import { ChainStep } from "@/lib/types";

// Jobbet som cv_job_claim levererar ur kön (redan kompilerad prompt).
export interface EngineJob {
  item_id: string;
  batch_id: string;
  shot_id: string;
  project_id: string;
  engine: string;
  prompt: string;
  chain: ChainStep[];
}

export interface EngineResult {
  // URL till resultatet. Mockar: app-relativ SVG. Riktiga adapters:
  // ladda upp till storage-bucketen canvas-media och returnera publik URL.
  mediaUrl: string;
  mediaType?: "image" | "video";
  // Motorns metadata (modell, seed, kostnad, latens...) — persisteras på varianten.
  meta: Record<string, unknown>;
}

export interface EngineAdapter {
  // Namnet som batches.engine matchas mot (t.ex. "mock-nano-banana", "nano-banana").
  name: string;
  kind: "image" | "video";
  // Kör ETT jobb. Kasta Error vid fel — runnern rapporterar via cv_job_fail
  // och kön går vidare. Idempotens: samma item_id kan komma om efter krasch.
  generate(job: EngineJob): Promise<EngineResult>;
}
