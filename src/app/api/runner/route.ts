import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/engines/runner";

// Kö-tick: dränerar adapter-kön. Anropas av UI:t efter batch-godkännande,
// av agenter (curl), eller senare av cron. Säker att anropa när som helst —
// tom kö är en no-op.
export async function POST(req: NextRequest) {
  let max = 25;
  let engine: string | undefined;
  try {
    const body = await req.json();
    if (typeof body.max === "number") max = Math.min(Math.max(1, body.max), 100);
    if (typeof body.engine === "string") engine = body.engine;
  } catch {
    // tom body ok
  }
  try {
    const summary = await drainQueue(max, engine);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
