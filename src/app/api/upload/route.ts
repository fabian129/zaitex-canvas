import { NextRequest, NextResponse } from "next/server";
import { callVerb, supabaseServer } from "@/lib/supabase/server";

// Uppladdning (intagsväg 3): multipart-fil → storage canvas-media → cv_intake.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = form.get("project_id");
    const shotId = form.get("shot_id");
    if (!(file instanceof File) || typeof projectId !== "string" || !projectId) {
      return NextResponse.json(
        { ok: false, error: "file + project_id krävs" },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "filen är för stor (>25MB)" }, { status: 400 });
    }
    const contentType = file.type || "application/octet-stream";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const path = `uploads/${crypto.randomUUID()}-${safeName}`;
    const sb = supabaseServer();
    const { error: upErr } = await sb.storage
      .from("canvas-media")
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType, upsert: false });
    if (upErr) throw new Error(`storage: ${upErr.message}`);
    const mediaUrl = sb.storage.from("canvas-media").getPublicUrl(path).data.publicUrl;

    const data = await callVerb("cv_intake", {
      p_project_id: projectId,
      p_media_url: mediaUrl,
      p_shot_id: typeof shotId === "string" && shotId ? shotId : null,
      p_source: "upload",
      p_media_type: contentType.startsWith("video/") ? "video" : "image",
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
