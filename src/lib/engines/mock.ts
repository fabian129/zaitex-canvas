// Mock-adapters: exercerar hela seamen (kö → generate → variant → Realtime → kurering)
// utan externa nycklar. Resultatet är en deterministisk SVG som bär motor + promptutdrag,
// serverad av /api/mock/render — så att man i browsern SER vilken kedja som producerade vad.

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
    },
  };
}

const LATENCY_MS = 600; // liten fördröjning så kö-status syns röra sig live i UI:t

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
