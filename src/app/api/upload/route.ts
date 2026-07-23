import { NextRequest, NextResponse } from "next/server";
import { callVerb } from "@/lib/supabase/server";
import { storeMedia } from "@/lib/media";

// Uppladdning (intagsväg 3): multipart-fil → storage canvas-media → cv_intake.
// Med moodboard_id i stället för project_id landar filen som moodboard-item —
// HTML-filer (komponentexports från Stitch/Paper/Pencil) blir kind 'html' och
// renderas sandboxat i brädet.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function moodKind(contentType: string, name: string): string {
  if (contentType.includes("html") || /\.html?$/i.test(name)) return "html";
  if (contentType.startsWith("video/")) return "video";
  if (contentType === "application/pdf") return "embed";
  if (contentType.startsWith("image/")) return "image";
  return "link";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = form.get("project_id");
    const moodboardId = form.get("moodboard_id");
    const shotId = form.get("shot_id");
    const toMoodboard = typeof moodboardId === "string" && moodboardId;
    if (!(file instanceof File) || (!toMoodboard && (typeof projectId !== "string" || !projectId))) {
      return NextResponse.json(
        { ok: false, error: "file + project_id eller moodboard_id krävs" },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "filen är för stor (>25MB)" }, { status: 400 });
    }
    const contentType = file.type || "application/octet-stream";
    const mediaUrl = await storeMedia(
      Buffer.from(await file.arrayBuffer()),
      contentType,
      "uploads",
      file.name
    );

    const data = toMoodboard
      ? await callVerb("cv_mood_intake", {
          p_moodboard_id: moodboardId,
          p_media_url: mediaUrl,
          p_kind: moodKind(contentType, file.name),
          p_title: file.name,
          p_source: "upload",
        })
      : await callVerb("cv_intake", {
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
