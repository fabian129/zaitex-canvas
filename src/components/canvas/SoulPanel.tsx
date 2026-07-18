"use client";

// SOUL ID:s (funktion 4): persistenta objekt (karaktär/plats/prop/stil) med
// referensbilder + promptfragment. Kopplas till shots, återanvänds över projekt.

import { useState } from "react";
import type { Shot, ShotSoul, Soul, SoulKind } from "@/lib/types";
import { verb } from "@/lib/api";
import { Chip, btnGhost, btnPrimary, inputCls, labelCls } from "./ui";

const KIND_LABEL: Record<SoulKind, string> = {
  character: "karaktär",
  place: "plats",
  prop: "prop",
  style: "stil",
};

const KIND_COLOR: Record<SoulKind, string> = {
  character: "bg-sky-900 text-sky-300",
  place: "bg-emerald-900 text-emerald-300",
  prop: "bg-amber-900 text-amber-300",
  style: "bg-violet-900 text-violet-300",
};

export function SoulPanel({
  souls,
  shotSouls,
  selectedShot,
  onChanged,
}: {
  souls: Soul[];
  shotSouls: ShotSoul[];
  selectedShot: Shot | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Soul | null>(null);
  const [creating, setCreating] = useState(false);

  const linkedIds = new Set(
    shotSouls.filter((ss) => selectedShot && ss.shot_id === selectedShot.id).map((ss) => ss.soul_id)
  );

  return (
    <div className="space-y-3" data-testid="soul-panel">
      <div className="flex items-center justify-between">
        <span className={labelCls}>Soul-biblioteket ({souls.length})</span>
        <button className={btnGhost} onClick={() => { setCreating(true); setEditing(null); }} data-testid="new-soul">
          + Ny Soul
        </button>
      </div>

      {(creating || editing) && (
        <SoulForm
          soul={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
            onChanged();
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <div className="space-y-2">
        {souls.map((soul) => {
          const linked = linkedIds.has(soul.id);
          return (
            <div
              key={soul.id}
              className={`rounded-lg border p-2.5 ${
                linked ? "border-emerald-700 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900"
              }`}
              data-testid={`soul-${soul.key}`}
            >
              <div className="flex items-center gap-2">
                {soul.ref_urls[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={soul.ref_urls[0]}
                    alt={soul.name}
                    className="h-10 w-10 shrink-0 rounded object-cover bg-zinc-950"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-100">{soul.name}</span>
                    <Chip className={KIND_COLOR[soul.kind]}>{KIND_LABEL[soul.kind]}</Chip>
                  </div>
                  <p className="truncate text-[11px] text-zinc-500" title={soul.prompt_fragment}>
                    {soul.prompt_fragment || "inget promptfragment"}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedShot &&
                  (linked ? (
                    <button
                      className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700"
                      onClick={() =>
                        void verb("cv_shot_soul_unlink", {
                          p_shot_id: selectedShot.id,
                          p_soul_id: soul.id,
                        }).then(onChanged)
                      }
                    >
                      Koppla loss
                    </button>
                  ) : (
                    <button
                      className="rounded bg-emerald-900/60 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-800"
                      onClick={() =>
                        void verb("cv_shot_soul_link", {
                          p_shot_id: selectedShot.id,
                          p_soul_id: soul.id,
                          p_role: soul.kind === "place" ? "location" : "subject",
                        }).then(onChanged)
                      }
                      data-testid={`link-soul-${soul.key}`}
                    >
                      → Koppla till vald shot
                    </button>
                  ))}
                <button
                  className="rounded px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-200"
                  onClick={() => { setEditing(soul); setCreating(false); }}
                >
                  Redigera
                </button>
                <button
                  className="rounded px-2 py-0.5 text-[11px] text-zinc-600 hover:text-red-400"
                  onClick={() => {
                    if (confirm(`Ta bort Soul "${soul.name}"?`))
                      void verb("cv_remove", { p_kind: "soul", p_id: soul.id }).then(onChanged);
                  }}
                >
                  Ta bort
                </button>
              </div>
            </div>
          );
        })}
        {souls.length === 0 && (
          <p className="text-xs text-zinc-500">
            Inga souls än. Skapa karaktärer/platser här — de bär referensbilder + promptfragment
            och dras in på shots i alla projekt.
          </p>
        )}
      </div>
    </div>
  );
}

function SoulForm({
  soul,
  onDone,
  onCancel,
}: {
  soul: Soul | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(soul?.key ?? "");
  const [name, setName] = useState(soul?.name ?? "");
  const [kind, setKind] = useState<SoulKind>(soul?.kind ?? "character");
  const [fragment, setFragment] = useState(soul?.prompt_fragment ?? "");
  const [negative, setNegative] = useState(soul?.negative_fragment ?? "");
  const [refUrls, setRefUrls] = useState((soul?.ref_urls ?? []).join("\n"));
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-2 rounded-lg border border-emerald-900/50 bg-zinc-900 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await verb("cv_soul_upsert", {
            p_soul_key: key.trim().toLowerCase().replace(/\s+/g, "-"),
            p_name: name.trim(),
            p_kind: kind,
            p_prompt_fragment: fragment,
            p_negative_fragment: negative,
            p_ref_urls: refUrls.split("\n").map((u) => u.trim()).filter(Boolean),
          });
          onDone();
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
      data-testid="soul-form"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Nyckel (slug)</label>
          <input
            className={inputCls}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="t.ex. grundaren"
            required
            disabled={Boolean(soul)}
            data-testid="soul-key"
          />
        </div>
        <div>
          <label className={labelCls}>Typ</label>
          <select
            className={inputCls}
            value={kind}
            onChange={(e) => setKind(e.target.value as SoulKind)}
          >
            <option value="character">karaktär</option>
            <option value="place">plats</option>
            <option value="prop">prop</option>
            <option value="style">stil</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Namn</label>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="t.ex. Grundaren (Fabian)"
          required
          data-testid="soul-name"
        />
      </div>
      <div>
        <label className={labelCls}>Promptfragment (identiteten)</label>
        <textarea
          className={`${inputCls} min-h-16`}
          value={fragment}
          onChange={(e) => setFragment(e.target.value)}
          placeholder="Beskrivningen som återanvänds i varje prompt där denna Soul ingår…"
          data-testid="soul-fragment"
        />
      </div>
      <div>
        <label className={labelCls}>Negativt fragment (undvik)</label>
        <input
          className={inputCls}
          value={negative}
          onChange={(e) => setNegative(e.target.value)}
          placeholder="t.ex. glasögon, kostym"
        />
      </div>
      <div>
        <label className={labelCls}>Referensbilder (en URL per rad)</label>
        <textarea
          className={`${inputCls} min-h-12 text-xs`}
          value={refUrls}
          onChange={(e) => setRefUrls(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} type="submit" disabled={busy} data-testid="save-soul">
          {busy ? "Sparar…" : "Spara Soul"}
        </button>
        <button className={btnGhost} type="button" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
