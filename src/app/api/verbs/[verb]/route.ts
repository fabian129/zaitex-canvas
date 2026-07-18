import { NextRequest, NextResponse } from "next/server";
import { callVerb, VERB_WHITELIST } from "@/lib/supabase/server";

// Generisk skriv-proxy: browsern POST:ar { ...params } till /api/verbs/<verb>.
// Verb-nyckeln läggs på server-side; endast whitelistade cv_*-verb släpps igenom.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ verb: string }> }
) {
  const { verb } = await params;
  if (!VERB_WHITELIST.has(verb)) {
    return NextResponse.json({ ok: false, error: `okänt verb: ${verb}` }, { status: 404 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // tom body är ok
  }
  try {
    const data = await callVerb(verb, body);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
