"use client";

// Projektets dataspine: laddar hela trädet via cv_*-vyerna och håller det färskt
// via Supabase Realtime (postgres_changes på canvas-schemat). Når inte websocketen
// fram (t.ex. brandvägg) faller hooken ner i polling — canvasen är aldrig död.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  Batch,
  BatchItem,
  Project,
  Scene,
  Shot,
  ShotSoul,
  Soul,
  Variant,
} from "@/lib/types";

export interface CanvasData {
  project: Project | null;
  scenes: Scene[];
  shots: Shot[];
  variants: Variant[];
  souls: Soul[];
  shotSouls: ShotSoul[];
  batches: Batch[];
  batchItems: BatchItem[];
}

export type LiveStatus = "connecting" | "live" | "poll";

const EMPTY: CanvasData = {
  project: null,
  scenes: [],
  shots: [],
  variants: [],
  souls: [],
  shotSouls: [],
  batches: [],
  batchItems: [],
};

const REALTIME_TABLES = [
  "projects",
  "scenes",
  "shots",
  "variants",
  "souls",
  "prompt_versions",
  "batches",
  "batch_items",
];

export function useCanvasData(projectId: string) {
  const [data, setData] = useState<CanvasData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    const sb = supabaseBrowser();
    const [proj, scenes, shots, variants, souls, shotSouls, batches] = await Promise.all([
      sb.from("cv_projects").select("*").eq("id", projectId).maybeSingle(),
      sb.from("cv_scenes").select("*").eq("project_id", projectId).order("position"),
      sb.from("cv_shots").select("*").eq("project_id", projectId).order("position"),
      sb.from("cv_variants").select("*").eq("project_id", projectId).order("created_at"),
      sb.from("cv_souls").select("*").order("created_at"),
      sb.from("cv_shot_souls").select("*"),
      sb.from("cv_batches").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    ]);
    const batchIds = (batches.data ?? []).map((b: Batch) => b.id);
    const batchItems = batchIds.length
      ? await sb.from("cv_batch_items").select("*").in("batch_id", batchIds).order("created_at")
      : { data: [] };
    setData({
      project: (proj.data as Project) ?? null,
      scenes: (scenes.data as Scene[]) ?? [],
      shots: (shots.data as Shot[]) ?? [],
      variants: (variants.data as Variant[]) ?? [],
      souls: (souls.data as Soul[]) ?? [],
      shotSouls: (shotSouls.data as ShotSoul[]) ?? [],
      batches: (batches.data as Batch[]) ?? [],
      batchItems: (batchItems.data as BatchItem[]) ?? [],
    });
    setLoading(false);
  }, [projectId]);

  // Debouncad refetch: många realtime-händelser i följd (batchkörning) → en läsning.
  const scheduleRefetch = useCallback(() => {
    setLastEventAt(Date.now());
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void loadAll(), 300);
  }, [loadAll]);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    void loadAll();

    const sb = supabaseBrowser();
    let channel = sb.channel(`canvas-${projectId}`);
    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "canvas", table },
        scheduleRefetch
      );
    }

    const startPolling = () => {
      if (pollTimer || disposed) return;
      setStatus("poll");
      pollTimer = setInterval(() => void loadAll(), 5000);
    };

    const graceTimer = setTimeout(startPolling, 6000);

    channel.subscribe((st) => {
      if (disposed) return;
      if (st === "SUBSCRIBED") {
        clearTimeout(graceTimer);
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        setStatus("live");
      } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
        startPolling();
      }
    });

    return () => {
      disposed = true;
      clearTimeout(graceTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      void sb.removeChannel(channel);
    };
  }, [projectId, loadAll, scheduleRefetch]);

  return { data, setData, loading, status, lastEventAt, refetch: loadAll };
}
