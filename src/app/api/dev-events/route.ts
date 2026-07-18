import { NextResponse } from "next/server";
import { Client } from "pg";
import { localPgEnabled } from "@/lib/localdb";

// SSE-bryggan: RIKTIG DB-push via LISTEN/NOTIFY (canvas.tg_notify triggar på varje
// skrivning i canvas-schemat). Liveness-fallback när Supabase Realtime-socketen
// inte går att öppna — samma semantik: DB-händelse → push → UI refetchar.

export const dynamic = "force-dynamic";

export async function GET() {
  if (!localPgEnabled()) {
    return NextResponse.json({ message: "lokal-läget är inte aktivt" }, { status: 404 });
  }
  const client = new Client({ connectionString: process.env.CANVAS_LOCAL_PG_URL });
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await client.connect();
        await client.query("listen canvas_changed");
        controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`));
        client.on("notification", (msg) => {
          try {
            controller.enqueue(encoder.encode(`data: ${msg.payload ?? "{}"}\n\n`));
          } catch {
            // stream stängd
          }
        });
        client.on("error", () => {
          try {
            controller.close();
          } catch {
            /* redan stängd */
          }
        });
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: hjärtslag\n\n`));
          } catch {
            /* stream stängd */
          }
        }, 15000);
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      void client.end();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
