import { NextRequest, NextResponse } from "next/server";
import { callVerb, supabaseServer } from "@/lib/supabase/server";

// INTAGET (funktion 2). Tre vägar in — alla landar som variant-rader i DB,
// och Realtime lyfter dem in i canvasen live (variant-rack-mönstret):
//   1. Agent med DB-åtkomst: cv_intake direkt i SQL (behöver inte denna route).
//   2. Agent/klient via HTTP: POST hit med { project_id, media_url, shot_id?, prompt?, source? }.
//   3. URL-pull: POST med { project_id, pull_url } — servern hämtar bilden och
//      lägger den i storage-bucketen canvas-media, sedan intake.
// shot_id utelämnad => varianten hamnar i projektets intags-tray.

const MAX_PULL_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let body: {
    project_id?: string;
    shot_id?: string;
    media_url?: string;
    pull_url?: string;
    prompt?: string;
    source?: string;
    media_type?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ogiltig JSON" }, { status: 400 });
  }
  if (!body.project_id) {
    return NextResponse.json({ ok: false, error: "project_id krävs" }, { status: 400 });
  }

  try {
    let mediaUrl = body.media_url;
    let source = body.source ?? "agent";

    if (!mediaUrl && body.pull_url) {
      const res = await fetch(body.pull_url, { redirect: "follow" });
      if (!res.ok) throw new Error(`URL-pull misslyckades: ${res.status} ${res.statusText}`);
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
        throw new Error(`URL-pull: oväntad content-type ${contentType}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_PULL_BYTES) throw new Error("URL-pull: filen är för stor (>15MB)");
      const ext = contentType.split("/")[1]?.split(";")[0] ?? "bin";
      const path = `pull/${crypto.randomUUID()}.${ext}`;
      const sb = supabaseServer();
      const { error: upErr } = await sb.storage
        .from("canvas-media")
        .upload(path, buf, { contentType, upsert: false });
      if (upErr) throw new Error(`storage: ${upErr.message}`);
      mediaUrl = sb.storage.from("canvas-media").getPublicUrl(path).data.publicUrl;
      source = "url";
    }

    if (!mediaUrl) {
      return NextResponse.json(
        { ok: false, error: "media_url eller pull_url krävs" },
        { status: 400 }
      );
    }

    const data = await callVerb("cv_intake", {
      p_project_id: body.project_id,
      p_media_url: mediaUrl,
      p_shot_id: body.shot_id ?? null,
      p_source: source,
      p_prompt: body.prompt ?? null,
      p_media_type: body.media_type ?? "image",
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
