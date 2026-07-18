// Kö-runnern: claimar jobb atomiskt ur adapter-kön (cv_job_claim, skip locked)
// och kör adaptern. SYNC-adapters rapporterar direkt (cv_job_finish/cv_job_fail);
// ASYNC-adapters dispatchar (cv_job_dispatch → status 'dispatched') och motorns
// webhook stänger jobbet senare via /api/engine-callback. Resultatvarianten
// skrivs av verben → Realtime uppdaterar UI:t. Flera runners kan köra parallellt.

import { ChainStep } from "@/lib/types";
import { callVerb } from "@/lib/supabase/server";
import { EngineJob, JobRef } from "./adapter";
import { getAdapter } from "./registry";

interface ClaimResponse {
  ok: boolean;
  job: EngineJob | null;
}

interface DispatchResponse {
  ok: boolean;
  item_id: string;
  callback_token: string;
}

export interface DrainSummary {
  processed: number;
  succeeded: number;
  dispatched: number;
  failed: number;
  errors: string[];
}

// Callback-URL:en motorn ska POST:a till. I prod: sätt CANVAS_PUBLIC_URL till
// appens publika adress (motorn måste nå den utifrån).
function callbackUrl(): string {
  const base = process.env.CANVAS_PUBLIC_URL ?? "http://localhost:3000";
  return base.replace(/\/$/, "") + "/api/engine-callback";
}

export async function drainQueue(maxJobs = 25, engine?: string): Promise<DrainSummary> {
  const summary: DrainSummary = {
    processed: 0,
    succeeded: 0,
    dispatched: 0,
    failed: 0,
    errors: [],
  };

  while (summary.processed < maxJobs) {
    const claim = await callVerb<ClaimResponse>("cv_job_claim", {
      p_engine: engine ?? null,
    });
    if (!claim.job) break;
    const job = claim.job;
    job.chain = (job.chain ?? []) as ChainStep[];
    job.refs = (job.refs ?? []) as JobRef[];
    job.camera_presets = job.camera_presets ?? [];
    summary.processed++;

    const fail = async (msg: string) => {
      await callVerb("cv_job_fail", { p_item_id: job.item_id, p_error: msg });
      summary.failed++;
      summary.errors.push(`${job.item_id}: ${msg}`);
    };

    const adapter = getAdapter(job.engine);
    if (!adapter) {
      await fail(`ingen adapter registrerad för motor "${job.engine}"`);
      continue;
    }

    // ASYNC-läget: dispatcha och lämna jobbet hos motorn (webhooken stänger det).
    if (adapter.dispatch) {
      try {
        const d = await callVerb<DispatchResponse>("cv_job_dispatch", {
          p_item_id: job.item_id,
        });
        await adapter.dispatch(job, {
          url: callbackUrl(),
          token: d.callback_token,
          item_id: job.item_id,
        });
        summary.dispatched++;
      } catch (e) {
        await fail(e instanceof Error ? e.message : String(e));
      }
      continue;
    }

    if (!adapter.generate) {
      await fail(`adaptern "${adapter.name}" saknar både generate och dispatch`);
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
      await fail(e instanceof Error ? e.message : String(e));
    }
  }
  return summary;
}
