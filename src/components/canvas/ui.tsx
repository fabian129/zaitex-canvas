"use client";

import type { BatchItemStatus, BatchStatus, ShotStatus, VariantStatus } from "@/lib/types";

export const SHOT_STATUS_LABEL: Record<ShotStatus, string> = {
  idea: "idé",
  ready: "redo",
  queued: "i kö",
  generated: "genererad",
  curated: "kurerad",
  locked: "låst",
};

export const SHOT_STATUS_COLOR: Record<ShotStatus, string> = {
  idea: "bg-zinc-700 text-zinc-300",
  ready: "bg-sky-900 text-sky-300",
  queued: "bg-amber-900 text-amber-300",
  generated: "bg-violet-900 text-violet-300",
  curated: "bg-emerald-900 text-emerald-300",
  locked: "bg-zinc-800 text-zinc-400",
};

export const VARIANT_STATUS_LABEL: Record<VariantStatus, string> = {
  new: "ny",
  kept: "behållen",
  rejected: "förkastad",
};

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  pending_approval: "väntar på godkännande",
  approved: "godkänd",
  running: "kör",
  done: "klar",
  cancelled: "avbruten",
};

export const ITEM_STATUS_LABEL: Record<BatchItemStatus, string> = {
  queued: "i kö",
  running: "kör",
  succeeded: "klar",
  failed: "fel",
  skipped: "skippad",
};

export const ITEM_STATUS_COLOR: Record<BatchItemStatus, string> = {
  queued: "text-amber-400",
  running: "text-sky-400 animate-pulse",
  succeeded: "text-emerald-400",
  failed: "text-red-400",
  skipped: "text-zinc-500",
};

export function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

export const btn =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
export const btnPrimary = `${btn} bg-emerald-600 text-white hover:bg-emerald-500`;
export const btnGhost = `${btn} bg-zinc-800 text-zinc-200 hover:bg-zinc-700`;
export const btnDanger = `${btn} bg-red-900/60 text-red-200 hover:bg-red-800`;
export const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-600 focus:outline-none";
export const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400";
