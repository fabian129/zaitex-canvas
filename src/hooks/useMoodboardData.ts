"use client";

// Moodboardets dataspine: brädet + dess items via cv_*-vyerna, färskt via
// Supabase Realtime med samma fallback-trappa som projektsidan
// (live → SSE-bryggan → polling) — brädet är aldrig dött.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { LiveStatus } from "@/hooks/useCanvasData";
import type { Moodboard, MoodboardItem, StudioClient } from "@/lib/types";

export interface MoodboardData {
  board: Moodboard | null;
  items: MoodboardItem[];
  clients: StudioClient[];
}

const EMPTY: MoodboardData = { board: null, items: [], clients: [] };

export function useMoodboardData(moodboardId: string) {
  const [data, setData] = useState<MoodboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    const sb = supabaseBrowser();
    const [board, items, clients] = await Promise.all([
      sb.from("cv_moodboards").select("*").eq("id", moodboardId).maybeSingle(),
      sb.from("cv_moodboard_items").select("*").eq("moodboard_id", moodboardId).order("position"),
      sb.from("cv_clients").select("*"),
    ]);
    setData({
      board: (board.data as Moodboard) ?? null,
      items: (items.data as MoodboardItem[]) ?? [],
      clients: (clients.data as StudioClient[]) ?? [],
    });
    setLoading(false);
  }, [moodboardId]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void loadAll(), 300);
  }, [loadAll]);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;
    let disposed = false;
    void loadAll();

    const sb = supabaseBrowser();
    let channel = sb.channel(`moodboard-${moodboardId}`);
    for (const table of ["moodboards", "moodboard_items"]) {
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

    const tryBridge = () => {
      if (disposed || eventSource) return;
      const es = new EventSource("/api/dev-events");
      es.addEventListener("ready", () => {
        if (disposed) return;
        eventSource = es;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        setStatus("bridge");
      });
      es.onmessage = scheduleRefetch;
      es.onerror = () => {
        es.close();
        if (eventSource === es) eventSource = null;
        startPolling();
      };
    };

    const graceTimer = setTimeout(tryBridge, 6000);

    channel.subscribe((st) => {
      if (disposed) return;
      if (st === "SUBSCRIBED") {
        clearTimeout(graceTimer);
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        setStatus("live");
      } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
        tryBridge();
      }
    });

    return () => {
      disposed = true;
      clearTimeout(graceTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (eventSource) eventSource.close();
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      void sb.removeChannel(channel);
    };
  }, [moodboardId, loadAll, scheduleRefetch]);

  return { data, loading, status, refetch: loadAll };
}
