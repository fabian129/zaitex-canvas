// NANO BANANA — första RIKTIGA adaptern (Googles Gemini-bildmodeller).
// Samma seam som mockarna: cv_job_claim ger kompilerad prompt + refs + presets,
// resultatet lagras via storeMedia och rapporteras med cv_job_finish.
//
// - API-nyckel: GEMINI_API_KEY (env, aldrig i klientkod). Modell: NANO_BANANA_MODEL
//   (default gemini-2.5-flash-image — klassiska nano banana, ~4 öre/bild).
// - Referens-slots skickas som flerbildsinput (Popcorn-mönstret → Geminis
//   multi-image-redigering). SVG stöds inte av API:t och filtreras bort (mockbilder).
// - Bakom företagsproxy (HTTPS_PROXY) används undicis ProxyAgent + egen fetch;
//   utan proxy (t.ex. Vercel) används vanlig fetch. NODE_EXTRA_CA_CERTS krävs
//   för MITM-proxyns CA-bundle.
// - Promptformerna är OBEVISADE tills bevis-loopen körts (skill canvas-bevisloopen).

import { readFileSync } from "node:fs";
import path from "node:path";
import { storeMedia } from "@/lib/media";
import { EngineAdapter, EngineJob, EngineResult, JobRef } from "./adapter";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-image";
// Geminis bild-API tar dessa som inline-input; SVG (mockrenders) stöds inte.
const SUPPORTED_REF_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);
const MAX_REF_BYTES = 7 * 1024 * 1024;

interface InlinePart {
  inlineData: { mimeType: string; data: string };
}

async function proxiedFetch(url: string, init: RequestInit): Promise<Response> {
  if (process.env.HTTPS_PROXY) {
    const { fetch: undiciFetch, ProxyAgent } = await import("undici");
    return undiciFetch(url, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: new ProxyAgent(process.env.HTTPS_PROXY),
    } as Parameters<typeof undiciFetch>[1]) as unknown as Response;
  }
  return fetch(url, init);
}

// Hämtar en referensbild och gör den till inline-input. Ref-URL:er kan vara
// app-relativa (/uploads/…, /api/mock/render…) eller absoluta (storage-CDN).
async function loadRef(ref: JobRef): Promise<InlinePart | null> {
  try {
    let buf: Buffer;
    let mime: string;
    if (ref.media_url.startsWith("/uploads/") && process.env.CANVAS_LOCAL_MEDIA) {
      const p = path.join(process.cwd(), "public", ref.media_url);
      buf = readFileSync(p);
      mime = ref.media_url.endsWith(".png") ? "image/png"
        : /\.jpe?g$/.test(ref.media_url) ? "image/jpeg"
        : ref.media_url.endsWith(".webp") ? "image/webp"
        : "image/svg+xml";
    } else {
      const base = process.env.CANVAS_PUBLIC_URL ?? "http://localhost:3000";
      const url = ref.media_url.startsWith("/") ? base.replace(/\/$/, "") + ref.media_url : ref.media_url;
      const res = await fetch(url);
      if (!res.ok) return null;
      mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!SUPPORTED_REF_MIME.has(mime) || buf.byteLength > MAX_REF_BYTES) return null;
    return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

export const nanoBanana: EngineAdapter = {
  name: "nano-banana",
  kind: "image",
  async generate(job: EngineJob): Promise<EngineResult> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY saknas i miljön");
    const model = process.env.NANO_BANANA_MODEL ?? DEFAULT_MODEL;

    // Refs först (bild-kontext), sedan prompten — [refs] + [relation/scenario]-mönstret.
    const refParts: InlinePart[] = [];
    const skippedRefs: number[] = [];
    for (const ref of job.refs ?? []) {
      const part = await loadRef(ref);
      if (part) refParts.push(part);
      else skippedRefs.push(ref.slot);
    }

    const t0 = Date.now();
    // Känd modell-egenhet: ibland kommer ett rent textsvar utan bild (särskilt på
    // oformade prompter). En omkörning brukar räcka — därefter är felet äkta.
    let img: InlinePart | undefined;
    let lastDetail = "";
    let attempts = 0;
    for (attempts = 1; attempts <= 2 && !img; attempts++) {
      const res = await proxiedFetch(`${API_BASE}/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [...refParts, { text: job.prompt }] }],
          // Tvingad bildmodalitet: med ["TEXT","IMAGE"] svarar modellen ibland i
          // chatläge utan bild (verifierat på oformade prompter) — ["IMAGE"] löser det.
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        candidates?: { content?: { parts?: (InlinePart & { text?: string })[]; }; finishReason?: string }[];
      };
      if (!res.ok) throw new Error(`nano-banana ${res.status}: ${data.error?.message ?? "okänt fel"}`);
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      img = parts.find((p) => "inlineData" in p && p.inlineData);
      if (!img) {
        const reason = data.candidates?.[0]?.finishReason ?? "okänd orsak";
        const text = parts.map((p) => p.text).filter(Boolean).join(" ").slice(0, 200);
        lastDetail = `${reason}${text ? `: ${text}` : ""}`;
      }
    }
    if (!img) throw new Error(`nano-banana: ingen bild i svaret efter 2 försök (${lastDetail})`);

    const mediaUrl = await storeMedia(
      Buffer.from(img.inlineData.data, "base64"),
      img.inlineData.mimeType,
      "engine/nano-banana",
      job.shot_id.slice(0, 8)
    );

    return {
      mediaUrl,
      mediaType: "image",
      meta: {
        engine: "nano-banana",
        model,
        latency_ms: Date.now() - t0,
        attempts: attempts - 1,
        refs_sent: refParts.length,
        refs_skipped: skippedRefs, // t.ex. SVG-mockar som API:t inte tar emot
        camera_presets: job.camera_presets ?? [],
        prompt_chars: job.prompt.length,
      },
    };
  },
};
