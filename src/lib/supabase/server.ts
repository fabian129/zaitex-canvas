import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-klient: anon-nyckel för läsning; skrivningar via cv_*-verben som
// kräver CANVAS_VERB_KEY (finns bara server-side).
export function supabaseServer(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export const VERB_WHITELIST = new Set([
  "cv_project_create",
  "cv_project_set",
  "cv_scene_add",
  "cv_scene_set",
  "cv_scene_reorder",
  "cv_shot_add",
  "cv_shot_set",
  "cv_shot_reorder",
  "cv_remove",
  "cv_intake",
  "cv_variant_curate",
  "cv_variant_assign",
  "cv_shot_select_variant",
  "cv_soul_upsert",
  "cv_shot_soul_link",
  "cv_shot_soul_unlink",
  "cv_shot_set_presets",
  "cv_shot_ref_set",
  "cv_shot_ref_clear",
  "cv_prompt_save",
  "cv_batch_create",
  "cv_batch_approve",
  "cv_batch_cancel",
  "cv_job_claim",
  "cv_job_finish",
  "cv_job_fail",
  "cv_job_dispatch",
  "cv_job_callback",
  "cv_moodboard_create",
  "cv_moodboard_set",
  "cv_mood_intake",
  "cv_mood_curate",
  "cv_mood_promote",
  "cv_mood_reorder",
]);

export async function callVerb<T = Record<string, unknown>>(
  verb: string,
  params: Record<string, unknown>
): Promise<T> {
  if (!VERB_WHITELIST.has(verb)) throw new Error(`okänt verb: ${verb}`);
  const allParams = { p_key: process.env.CANVAS_VERB_KEY, ...params };

  // Lokal-läget (bevis-stack utan egress): samma verb, direkt mot Postgres.
  const { localPgEnabled, localCallVerb } = await import("@/lib/localdb");
  if (localPgEnabled()) {
    try {
      return (await localCallVerb(verb, allParams)) as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${verb}: ${msg}`);
    }
  }

  const sb = supabaseServer();
  const { data, error } = await sb.rpc(verb, allParams);
  if (error) throw new Error(`${verb}: ${error.message}`);
  return data as T;
}
