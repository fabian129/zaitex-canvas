import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";

// Media-lagring bakom en flagga: prod = Supabase Storage (bucket canvas-media),
// lokal-läget (CANVAS_LOCAL_MEDIA=1) = filer under public/uploads.

const EXT_BY_TYPE: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function storeMedia(
  buf: Buffer,
  contentType: string,
  prefix: string,
  nameHint?: string
): Promise<string> {
  const ext = EXT_BY_TYPE[contentType] ?? contentType.split("/")[1]?.split(";")[0] ?? "bin";
  const safeHint = (nameHint ?? "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const fileName = `${crypto.randomUUID()}${safeHint ? "-" + safeHint : ""}.${ext}`;

  if (process.env.CANVAS_LOCAL_MEDIA) {
    const dir = path.join(process.cwd(), "public", "uploads");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, fileName), buf);
    return `/uploads/${fileName}`;
  }

  const sb = supabaseServer();
  const storagePath = `${prefix}/${fileName}`;
  const { error } = await sb.storage
    .from("canvas-media")
    .upload(storagePath, buf, { contentType, upsert: false });
  if (error) throw new Error(`storage: ${error.message}`);
  return sb.storage.from("canvas-media").getPublicUrl(storagePath).data.publicUrl;
}
