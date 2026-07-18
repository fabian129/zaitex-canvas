"use client";

// KURERINGEN (funktion 3): variant-stacken per shot — A/B/C..., behåll/förkasta,
// kommentar, och "Välj" som sätter shotens huvudbild (cv_shot_select_variant).

import { useState } from "react";
import type { Shot, Variant } from "@/lib/types";
import { verb } from "@/lib/api";
import { Chip, VARIANT_STATUS_LABEL, btnGhost, inputCls } from "./ui";

function label(i: number): string {
  return String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
}

export function VariantStack({
  shot,
  variants,
  onChanged,
}: {
  shot: Shot;
  variants: Variant[];
  onChanged: () => void;
}) {
  const ofShot = variants.filter((v) => v.shot_id === shot.id);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, id: string) => {
    setBusy(id);
    try {
      await fn();
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (ofShot.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Inga varianter än — kör en batch, dra in från intags-trayn eller låt en agent lägga bilder.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="variant-stack">
      {ofShot.map((v, i) => {
        const isPick = shot.selected_variant_id === v.id;
        return (
          <div
            key={v.id}
            className={`rounded-lg border p-2 ${
              isPick
                ? "border-emerald-500 bg-emerald-950/20"
                : v.status === "rejected"
                  ? "border-zinc-800 opacity-50"
                  : "border-zinc-700 bg-zinc-900"
            }`}
            data-testid={`variant-${v.id}`}
          >
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={v.media_url}
                alt={`Variant ${label(i)}`}
                className="h-20 w-32 shrink-0 rounded object-cover bg-zinc-950"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-100">{label(i)}</span>
                  <Chip
                    className={
                      v.status === "kept"
                        ? "bg-emerald-900 text-emerald-300"
                        : v.status === "rejected"
                          ? "bg-red-950 text-red-400"
                          : "bg-zinc-800 text-zinc-300"
                    }
                  >
                    {VARIANT_STATUS_LABEL[v.status]}
                  </Chip>
                  <span className="truncate text-[10px] text-zinc-500">
                    {v.engine ?? v.source}
                  </span>
                  {isPick && <Chip className="bg-emerald-700 text-white">vald</Chip>}
                </div>
                {v.prompt && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500" title={v.prompt}>
                    {v.prompt}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    className="rounded bg-emerald-900/60 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-800 disabled:opacity-40"
                    disabled={busy === v.id}
                    onClick={() =>
                      act(
                        () => verb("cv_shot_select_variant", { p_shot_id: shot.id, p_variant_id: v.id }),
                        v.id
                      )
                    }
                  >
                    Välj
                  </button>
                  <button
                    className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                    disabled={busy === v.id}
                    onClick={() =>
                      act(
                        () => verb("cv_variant_curate", { p_variant_id: v.id, p_status: "kept" }),
                        v.id
                      )
                    }
                  >
                    Behåll
                  </button>
                  <button
                    className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-red-950 hover:text-red-300 disabled:opacity-40"
                    disabled={busy === v.id}
                    onClick={() =>
                      act(
                        () => verb("cv_variant_curate", { p_variant_id: v.id, p_status: "rejected" }),
                        v.id
                      )
                    }
                  >
                    Förkasta
                  </button>
                  <button
                    className="rounded px-2 py-0.5 text-[11px] text-zinc-600 hover:text-red-400 disabled:opacity-40"
                    disabled={busy === v.id}
                    onClick={() => {
                      if (confirm("Ta bort varianten permanent?"))
                        void act(() => verb("cv_remove", { p_kind: "variant", p_id: v.id }), v.id);
                    }}
                  >
                    Ta bort
                  </button>
                </div>
              </div>
            </div>
            <CommentField variant={v} onChanged={onChanged} />
          </div>
        );
      })}
    </div>
  );
}

function CommentField({ variant, onChanged }: { variant: Variant; onChanged: () => void }) {
  const [text, setText] = useState(variant.comment ?? "");
  return (
    <input
      className={`${inputCls} mt-2 text-xs`}
      placeholder="Kommentar (kureringsanteckning)…"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== (variant.comment ?? "")) {
          void verb("cv_variant_curate", { p_variant_id: variant.id, p_comment: text }).then(onChanged);
        }
      }}
    />
  );
}

export { btnGhost };
