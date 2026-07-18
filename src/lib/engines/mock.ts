// Mock-adapters: exercerar hela seamen (kö → generate/dispatch → variant →
// Realtime → kurering) utan externa nycklar. Resultatet är en deterministisk SVG
// som bär motor + promptutdrag, serverad av /api/mock/render — så att man i
// browsern SER vilken kedja som producerade vad.

import { EngineAdapter, EngineJob, EngineResult } from "./adapter";

function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function mockResult(job: EngineJob, kind: "image" | "video"): EngineResult {
  const seed = seedFrom(job.item_id);
  const params = new URLSearchParams({
    seed: String(seed),
    engine: job.engine,
    kind,
    prompt: job.prompt.slice(0, 220),
  });
  return {
    mediaUrl: `/api/mock/render?${params.toString()}`,
    mediaType: "image", // mocken renderar alltid stillbild (video-mock = poster frame)
    meta: {
      mock: true,
      seed,
      engine: job.engine,
      chain_len: job.chain.length,
      prompt_chars: job.prompt.length,
      // Bevis för att kö-payloaden bär referenser + presets hela vägen till motorn
      refs: (job.refs ?? []).length,
      camera_presets: job.camera_presets ?? [],
    },
  };
}

const LATENCY_MS = 600; // liten fördröjning så kö-status syns röra sig live i UI:t
const ASYNC_LATENCY_MS = 1500; // "motorn processar" innan webhooken landar

export const mockNanoBanana: EngineAdapter = {
  name: "mock-nano-banana",
  kind: "image",
  async generate(job) {
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    return mockResult(job, "image");
  },
};

export const mockHiggsfield: EngineAdapter = {
  name: "mock-higgsfield",
  kind: "video",
  async generate(job) {
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    return mockResult(job, "video");
  },
};

// ASYNC-MOCKEN (webhook-seamen): dispatch återvänder direkt; en simulerad
// "extern motor" svarar efter en stund med POST till callback-URL:en —
// exakt som Higgsfield X-Webhook-URL / fal.ai queue-webhooks. Callbacken
// är idempotent i DB, så retries/dubbletter från motorn är ofarliga.
export const mockHiggsfieldAsync: EngineAdapter = {
  name: "mock-higgsfield-async",
  kind: "video",
  async dispatch(job, callback) {
    const externalJobId = `mock-async-${seedFrom(job.item_id).toString(16)}`;
    const result = mockResult(job, "video");
    setTimeout(() => {
      void fetch(callback.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: callback.item_id,
          token: callback.token,
          status: "succeeded",
          media_url: result.mediaUrl,
          external_job_id: externalJobId,
          meta: { ...result.meta, async: true, external_job_id: externalJobId },
        }),
      }).catch(() => {
        // Simulerad motor: tappad callback lämnar jobbet i 'dispatched' —
        // precis som verkligheten. Runbook: felmarkera via cv_job_fail.
      });
    }, ASYNC_LATENCY_MS);
    return { externalJobId };
  },
};
