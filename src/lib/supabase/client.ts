"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Browser-klient (anon): läser via cv_*-vyerna + Realtime på canvas-schemat.
// Alla skrivningar går via /api/verbs (server-side, verb-nyckel) — aldrig härifrån.
let browserClient: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return browserClient;
}
