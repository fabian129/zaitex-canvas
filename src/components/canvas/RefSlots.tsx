"use client";

// REFERENS-SLOTS (Popcorn-mönstret): upp till 4 typade bildreferenser per shot —
// identitet/stil/struktur/kontinuitet. Referensen väljs ur intags-trayn eller
// shotens varianter (eller hämtas från föregående shots valda bild = kontinuitet).
// Kompilatorn tar med REF-raderna; cv_job_claim bär URL:erna hela vägen till adaptern.

import { useState } from "react";
import type { RefRole, Scene, Shot, ShotRef, Variant } from "@/lib/types";
import { verb } from "@/lib/api";
import { Chip, labelCls } from "./ui";

const ROLES: RefRole[] = ["identitet", "stil", "struktur", "kontinuitet"];
const SLOTS = [1, 2, 3, 4];

const ROLE_COLOR: Record<RefRole, string> = {
  identitet: "bg-sky-950 text-sky-300",
  stil: "bg-fuchsia-950 text-fuchsia-300",
  struktur: "bg-amber-950 text-amber-300",
  kontinuitet: "bg-emerald-950 text-emerald-300",
};

// Samma bildprioritet som brädet/exporten: vald → behållen → senaste ej förkastade.
function pickImage(shot: Shot, variants: Variant[]): Variant | null {
  const ofShot = variants.filter((v) => v.shot_id === shot.id);
  const selected = ofShot.find((v) => v.id === shot.selected_variant_id);
  if (selected) return selected;
  const kept = ofShot.filter((v) => v.status === "kept");
  if (kept.length) return kept[kept.length - 1];
  const fresh = ofShot.filter((v) => v.status !== "rejected");
  return fresh.length ? fresh[fresh.length - 1] : null;
}

export function RefSlots({
  shot,
  scenes,
  shots,
  variants,
  refs,
  onChanged,
}: {
  shot: Shot;
  scenes: Scene[];
  shots: Shot[];
  variants: Variant[];
  refs: ShotRef[]; // redan filtrerade till denna shot
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [role, setRole] = useState<Record<number, RefRole>>({});

  // Föregående shot i brädordningen (scener × shots) — kontinuitetsreferensen.
  const ordered = [...scenes]
    .sort((a, b) => a.position - b.position)
    .flatMap((sc) =>
      shots.filter((s) => s.scene_id === sc.id).sort((a, b) => a.position - b.position)
    );
  const idx = ordered.findIndex((s) => s.id === shot.id);
  const prevShot = idx > 0 ? ordered[idx - 1] : null;
  const prevImage = prevShot ? pickImage(prevShot, variants) : null;

  // Valbara källor: intags-trayn + shotens egna varianter.
  const sources = [
    ...variants.filter((v) => v.shot_id === null).map((v) => ({ v, label: "tray" })),
    ...variants.filter((v) => v.shot_id === shot.id).map((v) => ({ v, label: "variant" })),
  ];

  const act = async (slot: number, fn: () => Promise<unknown>) => {
    setBusy(slot);
    try {
      await fn();
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <span className={labelCls}>Referens-slots (max 4 — typade inputs till kedjan)</span>
      <div className="space-y-1.5">
        {SLOTS.map((slot) => {
          const ref = refs.find((r) => r.slot === slot);
          if (ref) {
            return (
              <div
                key={slot}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5"
                data-testid={`ref-slot-${slot}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ref.media_url}
                  alt={`Referens ${slot}`}
                  className="h-10 w-16 shrink-0 rounded object-cover bg-zinc-950"
                />
                <span className="text-xs font-bold text-zinc-500">{slot}</span>
                <Chip className={ROLE_COLOR[ref.role]}>{ref.role}</Chip>
                <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-500" title={ref.note ?? ref.media_url}>
                  {ref.note ?? ref.media_url}
                </span>
                <button
                  className="text-xs text-zinc-600 hover:text-red-400 disabled:opacity-30"
                  disabled={busy === slot}
                  onClick={() =>
                    void act(slot, () =>
                      verb("cv_shot_ref_clear", { p_shot_id: shot.id, p_slot: slot })
                    )
                  }
                  data-testid={`ref-clear-${slot}`}
                >
                  ✕
                </button>
              </div>
            );
          }
          return (
            <div
              key={slot}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-800 p-1.5"
              data-testid={`ref-slot-${slot}`}
            >
              <span className="text-xs font-bold text-zinc-600">{slot}</span>
              <select
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300"
                value={pick[slot] ?? ""}
                onChange={(e) => setPick({ ...pick, [slot]: e.target.value })}
                data-testid={`ref-src-${slot}`}
              >
                <option value="">välj bild…</option>
                {sources.map(({ v, label }, i) => (
                  <option key={v.id} value={v.id}>
                    [{label}] {v.prompt?.slice(0, 40) || v.source} #{i + 1}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300"
                value={role[slot] ?? "identitet"}
                onChange={(e) => setRole({ ...role, [slot]: e.target.value as RefRole })}
                data-testid={`ref-role-${slot}`}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                disabled={!pick[slot] || busy === slot}
                onClick={() => {
                  const v = variants.find((x) => x.id === pick[slot]);
                  if (!v) return;
                  void act(slot, () =>
                    verb("cv_shot_ref_set", {
                      p_shot_id: shot.id,
                      p_slot: slot,
                      p_variant_id: v.id,
                      p_role: role[slot] ?? "identitet",
                      p_note: v.prompt ?? null,
                    })
                  );
                }}
                data-testid={`ref-set-${slot}`}
              >
                Sätt
              </button>
              {prevImage && (
                <button
                  className="rounded px-1.5 py-1 text-[11px] text-emerald-500 hover:bg-emerald-950 disabled:opacity-30"
                  disabled={busy === slot}
                  title={`Kontinuitet: ${prevShot?.title || "föregående shot"}s valda bild`}
                  onClick={() =>
                    void act(slot, () =>
                      verb("cv_shot_ref_set", {
                        p_shot_id: shot.id,
                        p_slot: slot,
                        p_variant_id: prevImage.id,
                        p_role: "kontinuitet",
                        p_note: `kontinuitet: ${prevShot?.title || "föregående shot"}`,
                      })
                    )
                  }
                  data-testid={`ref-prev-${slot}`}
                >
                  ‹ föreg.
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
