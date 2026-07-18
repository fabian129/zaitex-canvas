import { NextRequest, NextResponse } from "next/server";
import { callVerb } from "@/lib/supabase/server";

// WEBHOOK-MOTTAGAREN (webhook-seamen): asynka motorer (Higgsfield X-Webhook-URL,
// fal.ai queue-webhooks — och mock-higgsfield-async) POST:ar resultatet hit.
// Autentisering: per-jobb-token utfärdad av cv_job_dispatch (DB lagrar bara hashen).
// IDEMPOTENT: retries/dubbletter på redan avslutade jobb svarar ok/already —
// motorer får skicka om utan att något dubbleras (fal-semantik).
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ogiltig JSON" }, { status: 400 });
  }
  const { item_id, token, status, media_url, meta, error, external_job_id } = body;
  if (typeof item_id !== "string" || typeof token !== "string" || typeof status !== "string") {
    return NextResponse.json(
      { ok: false, error: "item_id, token och status krävs" },
      { status: 400 }
    );
  }
  try {
    const data = await callVerb("cv_job_callback", {
      p_item_id: item_id,
      p_token: token,
      p_status: status,
      p_media_url: typeof media_url === "string" ? media_url : null,
      p_meta: meta && typeof meta === "object" ? meta : {},
      p_error: typeof error === "string" ? error : null,
      p_external_job_id: typeof external_job_id === "string" ? external_job_id : null,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Ogiltig token/okänt item = 4xx så motorn slutar försöka; övrigt 500 = retry välkommen.
    const permanent = msg.includes("ogiltig callback-token") || msg.includes("okänt item");
    return NextResponse.json({ ok: false, error: msg }, { status: permanent ? 403 : 500 });
  }
}
