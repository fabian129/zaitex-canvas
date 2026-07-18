// Kö-runnern: claimar jobb atomiskt ur adapter-kön (cv_job_claim, skip locked),
// kör adaptern och rapporterar (cv_job_finish/cv_job_fail). Resultatvarianten
// skrivs av verbet → Realtime uppdaterar UI:t. Flera runners kan köra parallellt.

import { ChainStep } from "@/lib/types";
import { callVerb } from "@/lib/supabase/server";
import { EngineJob } from "./adapter";
import { getAdapter } from "./registry";

interface ClaimResponse {
  ok: boolean;
  job: EngineJob | null;
}

export interface DrainSummary {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

export async function drainQueue(maxJobs = 25, engine?: string): Promise<DrainSummary> {
  const summary: DrainSummary = { processed: 0, succeeded: 0, failed: 0, errors: [] };

  while (summary.processed < maxJobs) {
    const claim = await callVerb<ClaimResponse>("cv_job_claim", {
      p_engine: engine ?? null,
    });
    if (!claim.job) break;
    const job = claim.job;
    job.chain = (job.chain ?? []) as ChainStep[];
    summary.processed++;

    const adapter = getAdapter(job.engine);
    if (!adapter) {
      await callVerb("cv_job_fail", {
        p_item_id: job.item_id,
        p_error: `ingen adapter registrerad för motor "${job.engine}"`,
      });
      summary.failed++;
      summary.errors.push(`${job.item_id}: okänd motor ${job.engine}`);
      continue;
    }

    try {
      const result = await adapter.generate(job);
      await callVerb("cv_job_finish", {
        p_item_id: job.item_id,
        p_media_url: result.mediaUrl,
        p_meta: result.meta,
      });
      summary.succeeded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await callVerb("cv_job_fail", { p_item_id: job.item_id, p_error: msg });
      summary.failed++;
      summary.errors.push(`${job.item_id}: ${msg}`);
    }
  }
  return summary;
}
