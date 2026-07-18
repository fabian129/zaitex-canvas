"use client";

// BATCHGRINDEN (funktion 6): jobblista → godkännande med tak → adapter-kö.
// Grinden är MEKANIK: cv_batch_approve skippar allt över taket i DB:t,
// oavsett vad UI:t säger. Motorerna är mock-adapters bakom seamen.

import { useState } from "react";
import type { Batch, BatchItem, Shot } from "@/lib/types";
import { runQueue, verb } from "@/lib/api";
import {
  BATCH_STATUS_LABEL,
  Chip,
  ITEM_STATUS_COLOR,
  ITEM_STATUS_LABEL,
  btnDanger,
  btnGhost,
  btnPrimary,
} from "./ui";

export function BatchPanel({
  batches,
  batchItems,
  shots,
  onChanged,
}: {
  batches: Batch[];
  batchItems: BatchItem[];
  shots: Shot[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const shotTitle = (id: string) => shots.find((s) => s.id === id)?.title || "namnlös shot";

  const approve = async (batch: Batch) => {
    setBusy(batch.id);
    try {
      await verb("cv_batch_approve", { p_batch_id: batch.id, p_approved_by: "fabian" });
      onChanged();
      // Grinden öppnad → sparka igång kön (mock-adaptrarna processar direkt).
      void runQueue(50).then(onChanged);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="batch-panel">
      {batches.length === 0 && (
        <p className="text-xs text-zinc-500">
          Inga batcher än. Aktivera &quot;Markera för batch&quot; i verktygsraden, bocka i shots och
          skapa en jobblista — den väntar sedan här på godkännande.
        </p>
      )}
      {batches.map((batch) => {
        const items = batchItems.filter((i) => i.batch_id === batch.id);
        const queued = items.filter((i) => i.status === "queued").length;
        return (
          <div
            key={batch.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            data-testid={`batch-box-${batch.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-semibold text-zinc-100">{batch.engine}</span>
                <span className="ml-2 text-[11px] text-zinc-500">
                  {items.length} jobb · tak {batch.cap_max_jobs}
                </span>
              </div>
              <Chip
                className={
                  batch.status === "pending_approval"
                    ? "bg-amber-900 text-amber-300"
                    : batch.status === "done"
                      ? "bg-emerald-900 text-emerald-300"
                      : batch.status === "cancelled"
                        ? "bg-zinc-800 text-zinc-500"
                        : "bg-sky-900 text-sky-300"
                }
              >
                {BATCH_STATUS_LABEL[batch.status]}
              </Chip>
            </div>

            <div className="mt-2 space-y-1">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-16 shrink-0 font-medium ${ITEM_STATUS_COLOR[item.status]}`}>
                    {ITEM_STATUS_LABEL[item.status]}
                  </span>
                  <span className="truncate text-zinc-400">{shotTitle(item.shot_id)}</span>
                  {item.error && (
                    <span className="truncate text-red-500" title={item.error}>
                      {item.error}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              {batch.status === "pending_approval" && (
                <>
                  <button
                    className={btnPrimary}
                    disabled={busy === batch.id}
                    onClick={() => approve(batch)}
                    data-testid={`approve-batch-${batch.id}`}
                  >
                    Godkänn ({Math.min(queued, batch.cap_max_jobs)} av {queued} inom taket)
                  </button>
                  <button
                    className={btnDanger}
                    disabled={busy === batch.id}
                    onClick={() =>
                      void verb("cv_batch_cancel", { p_batch_id: batch.id }).then(onChanged)
                    }
                  >
                    Avbryt
                  </button>
                </>
              )}
              {(batch.status === "approved" || batch.status === "running") && (
                <button
                  className={btnGhost}
                  onClick={() => void runQueue(50).then(onChanged)}
                  data-testid={`run-queue-${batch.id}`}
                >
                  Kör kön
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
