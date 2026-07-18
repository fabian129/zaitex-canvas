// LOKAL-LÄGET (bevis-stack): direkt Postgres i stället för Supabase-molnet.
// Aktiveras av CANVAS_LOCAL_PG_URL. Prod-vägen (supabase-js → PostgREST/Realtime/Storage)
// är orörd — detta är en parallell, tydligt avgränsad väg för sandboxar utan egress.

import { Pool } from "pg";

let pool: Pool | null = null;

export function localPgEnabled(): boolean {
  return Boolean(process.env.CANVAS_LOCAL_PG_URL);
}

export function localPg(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.CANVAS_LOCAL_PG_URL, max: 5 });
  }
  return pool;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function assertIdent(name: string, what: string): string {
  if (!IDENT.test(name)) throw new Error(`ogiltig ${what}: ${name}`);
  return name;
}

// Anropar ett cv_*-verb med namngivna argument. Parametertyperna löses av Postgres
// själv ur funktionssignaturen (verben är inte överlagrade). jsonb-parametrar
// måste stringifieras explicit — annars serialiserar node-pg JS-arrayer till
// PG-arrayliteral, vilket är rätt för uuid[]/text[] men fel för jsonb.
const JSONB_PARAMS = new Set(["p_chain", "p_meta"]);

export async function localCallVerb(
  verb: string,
  params: Record<string, unknown>
): Promise<unknown> {
  assertIdent(verb, "verbnamn");
  const keys = Object.keys(params).map((k) => assertIdent(k, "parameternamn"));
  const args = keys.map((k, i) => `${k} := $${i + 1}`).join(", ");
  const values = keys.map((k) => {
    const v = params[k];
    if (JSONB_PARAMS.has(k) && v !== null && typeof v === "object") return JSON.stringify(v);
    return v;
  });
  const sql = `select public.${verb}(${args}) as result`;
  const res = await localPg().query(sql, values);
  return res.rows[0]?.result;
}
