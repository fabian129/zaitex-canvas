import { NextRequest, NextResponse } from "next/server";
import { callVerb, supabaseServer } from "@/lib/supabase/server";

// STUDIOS INGÅNG TILL CANVASEN (mergen med studio, funktionellt):
// GET /from-item/<content_item_id> → öppnar content-itemets storyboard.
// Finns inget canvas-projekt för itemet skapas ett (kopplat till klient + plan + item)
// och användaren landar direkt i brädet. Studio behöver bara länka hit —
// t.ex. "Öppna storyboard" på varje content-item.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const sb = supabaseServer();

  const { data: existing } = await sb
    .from("cv_projects")
    .select("id")
    .eq("content_item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.redirect(new URL(`/p/${existing[0].id}`, req.nextUrl.origin));
  }

  const { data: item } = await sb
    .from("cv_content_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ ok: false, error: "okänt content-item" }, { status: 404 });
  }

  try {
    const res = await callVerb<{ id: string }>("cv_project_create", {
      p_title: item.title || "Storyboard",
      p_client_id: item.client_id,
      p_content_plan_id: item.content_plan_id,
      p_content_item_id: itemId,
      p_format: item.platform === "tiktok" || item.platform === "reels" ? "9:16" : "16:9",
      p_brief: [item.hook, item.caption].filter(Boolean).join("\n\n") || null,
    });
    return NextResponse.redirect(new URL(`/p/${res.id}`, req.nextUrl.origin));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
