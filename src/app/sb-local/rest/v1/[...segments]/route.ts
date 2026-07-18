import { NextRequest, NextResponse } from "next/server";
import { assertIdent, localPg, localPgEnabled } from "@/lib/localdb";

// LOKAL-LÄGETS REST-shim: en minimal PostgREST-kompatibel läsyta för cv_*-vyerna,
// så att supabase-js i browsern fungerar oförändrad när NEXT_PUBLIC_SUPABASE_URL
// pekar på http://localhost:3000/sb-local. Endast GET + (eq|in|order|limit) — det
// är hela ytan canvasen använder. Skrivningar går aldrig här (de går via /api/verbs).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> }
) {
  if (!localPgEnabled()) {
    return NextResponse.json({ message: "lokal-läget är inte aktivt" }, { status: 404 });
  }
  const { segments } = await params;
  if (segments.length !== 1 || !segments[0].startsWith("cv_")) {
    return NextResponse.json({ message: "endast cv_*-vyer" }, { status: 404 });
  }
  const view = assertIdent(segments[0], "vy");

  const where: string[] = [];
  const values: unknown[] = [];
  const orderBy: string[] = [];
  let limit: number | null = null;

  for (const [key, raw] of req.nextUrl.searchParams.entries()) {
    if (key === "select") continue; // shim:en returnerar alltid hela raden
    if (key === "order") {
      for (const part of raw.split(",")) {
        const [col, dir] = part.split(".");
        orderBy.push(`${assertIdent(col, "kolumn")} ${dir === "desc" ? "desc" : "asc"}`);
      }
      continue;
    }
    if (key === "limit") {
      limit = Math.max(1, Math.min(1000, parseInt(raw, 10) || 100));
      continue;
    }
    const col = assertIdent(key, "kolumn");
    if (raw.startsWith("eq.")) {
      values.push(raw.slice(3));
      where.push(`${col} = $${values.length}`);
    } else if (raw.startsWith("in.(") && raw.endsWith(")")) {
      const list = raw
        .slice(4, -1)
        .split(",")
        .map((s) => s.replace(/^"|"$/g, ""))
        .filter(Boolean);
      values.push(list);
      where.push(`${col} = any($${values.length})`);
    } else {
      return NextResponse.json(
        { message: `shim: operatorn stöds inte: ${key}=${raw}` },
        { status: 400 }
      );
    }
  }

  const sql =
    `select to_jsonb(t) as row from public.${view} t` +
    (where.length ? ` where ${where.join(" and ")}` : "") +
    (orderBy.length ? ` order by ${orderBy.join(", ")}` : "") +
    (limit ? ` limit ${limit}` : "");

  try {
    const res = await localPg().query(sql, values);
    const rows = res.rows.map((r) => r.row);
    const wantsObject = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    return NextResponse.json(wantsObject ? (rows[0] ?? null) : rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
