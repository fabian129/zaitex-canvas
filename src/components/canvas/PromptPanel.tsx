"use client";

// PROMPT-PANELEN (funktion 5): kompilerad operations-KEDJA per shot —
// recept (shot) + Soul ID:s + kamera/ljus/rörelse + kedjesteg → kompilerad prompt.
// Redigerbar, versionerad (cv_prompt_save), lintad mot kedjereglerna.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { verb } from "@/lib/api";
import {
  CAMERA_PRESETS,
  CAMERA_PRESET_MAP,
  MAX_CAMERA_PRESETS,
  PRESET_CATEGORIES,
} from "@/lib/promptbrain/camera";
import { compileChain } from "@/lib/promptbrain/compile";
import { OPERATIONS, OPERATION_MAP } from "@/lib/promptbrain/operations";
import type { ChainStep, PromptVersion, Shot, ShotRef, Soul } from "@/lib/types";
import { Chip, btnGhost, btnPrimary, inputCls, labelCls } from "./ui";

const ENGINE_HINTS = ["", "nano-banana", "mock-nano-banana", "mock-higgsfield", "mock-higgsfield-async"];

export function PromptPanel({
  shot,
  souls,
  refs,
  onSaved,
}: {
  shot: Shot;
  souls: Soul[];
  refs: ShotRef[]; // redan filtrerade till denna shot
  onSaved: () => void;
}) {
  const [chain, setChain] = useState<ChainStep[]>([]);
  const [engineHint, setEngineHint] = useState<string>("mock-nano-banana");
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadVersions = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("cv_prompt_versions")
      .select("*")
      .eq("shot_id", shot.id)
      .order("version", { ascending: false });
    const list = (data as PromptVersion[]) ?? [];
    setVersions(list);
    return list;
  }, [shot.id]);

  useEffect(() => {
    let cancelled = false;
    void loadVersions().then((list) => {
      if (cancelled) return;
      const current = list.find((v) => v.id === shot.current_prompt_version_id) ?? list[0];
      if (current) {
        setChain(current.chain ?? []);
        setEngineHint(current.engine_hint ?? "");
        setLoadedVersion(current.version);
      } else {
        setChain([]);
        setLoadedVersion(null);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

  const { compiled, warnings } = useMemo(
    () => compileChain(shot, souls, chain, engineHint || null, refs),
    [shot, souls, chain, engineHint, refs]
  );

  const presets = shot.camera_presets ?? [];
  const setPresets = async (next: string[]) => {
    try {
      await verb("cv_shot_set_presets", { p_shot_id: shot.id, p_presets: next });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await verb("cv_prompt_save", {
        p_shot_id: shot.id,
        p_chain: chain,
        p_compiled: compiled,
        p_engine_hint: engineHint || null,
      });
      const list = await loadVersions();
      setLoadedVersion(list[0]?.version ?? null);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="prompt-panel">
      {/* Kamera-presets (Higgsfield-mönstret): namngiven vokabulär, stack max 3 */}
      <div>
        <span className={labelCls}>
          Kamera-presets (stack {presets.length}/{MAX_CAMERA_PRESETS})
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((id) => (
            <Chip key={id} className="bg-violet-950 text-violet-300" data-testid={`preset-chip-${id}`}>
              {CAMERA_PRESET_MAP[id]?.label ?? id}
              <button
                className="ml-1.5 text-violet-500 hover:text-red-400"
                onClick={() => void setPresets(presets.filter((p) => p !== id))}
                title="Ta bort preset"
              >
                ✕
              </button>
            </Chip>
          ))}
          <select
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 disabled:opacity-40"
            value=""
            disabled={presets.length >= MAX_CAMERA_PRESETS}
            onChange={(e) => {
              if (e.target.value && !presets.includes(e.target.value)) {
                void setPresets([...presets, e.target.value]);
              }
            }}
            title={
              presets.length >= MAX_CAMERA_PRESETS
                ? `Stackningstaket: max ${MAX_CAMERA_PRESETS} presets (DB:t vägrar fler)`
                : "Lägg till kamera-preset"
            }
            data-testid="preset-select"
          >
            <option value="">+ preset…</option>
            {PRESET_CATEGORIES.map((cat) => (
              <optgroup key={cat} label={cat}>
                {CAMERA_PRESETS.filter((p) => p.category === cat && !presets.includes(p.id)).map(
                  (p) => (
                    <option key={p.id} value={p.id} title={p.description}>
                      {p.label}
                    </option>
                  )
                )}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className={labelCls}>Kedjan</span>
        {versions.length > 0 && (
          <select
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
            value={loadedVersion ?? ""}
            onChange={(e) => {
              const v = versions.find((x) => x.version === Number(e.target.value));
              if (v) {
                setChain(v.chain ?? []);
                setEngineHint(v.engine_hint ?? "");
                setLoadedVersion(v.version);
              }
            }}
            data-testid="prompt-version-select"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.version}>
                v{v.version}
                {v.id === shot.current_prompt_version_id ? " (aktiv)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {chain.map((step, i) => {
        const op = OPERATION_MAP[step.op];
        return (
          <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400">{i + 1}.</span>
              <select
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                value={step.op}
                onChange={(e) => {
                  const next = [...chain];
                  next[i] = { ...next[i], op: e.target.value };
                  setChain(next);
                }}
              >
                {OPERATIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="flex-1 truncate text-[10px] text-zinc-600">{op?.description}</span>
              <button
                className="text-xs text-zinc-600 hover:text-zinc-300 disabled:opacity-30"
                disabled={i === 0}
                onClick={() => {
                  const next = [...chain];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setChain(next);
                }}
                title="Flytta upp"
              >
                ↑
              </button>
              <button
                className="text-xs text-zinc-600 hover:text-zinc-300 disabled:opacity-30"
                disabled={i === chain.length - 1}
                onClick={() => {
                  const next = [...chain];
                  [next[i], next[i + 1]] = [next[i + 1], next[i]];
                  setChain(next);
                }}
                title="Flytta ner"
              >
                ↓
              </button>
              <button
                className="text-xs text-zinc-600 hover:text-red-400"
                onClick={() => setChain(chain.filter((_, j) => j !== i))}
                title="Ta bort steg"
              >
                ✕
              </button>
            </div>
            <input
              className={`${inputCls} text-xs`}
              placeholder={op?.paramsHint ?? "parametrar…"}
              value={step.params}
              onChange={(e) => {
                const next = [...chain];
                next[i] = { ...next[i], params: e.target.value };
                setChain(next);
              }}
            />
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <button
          className={btnGhost}
          onClick={() => setChain([...chain, { op: "restyle", params: "" }])}
          data-testid="add-chain-step"
        >
          + Steg
        </button>
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300"
          value={engineHint}
          onChange={(e) => setEngineHint(e.target.value)}
          title="Motor-dialekt (formatet är OBEVISAT tills riktig motor kopplas)"
          data-testid="engine-hint-select"
        >
          {ENGINE_HINTS.map((h) => (
            <option key={h} value={h}>
              {h || "ingen dialekt"}
            </option>
          ))}
        </select>
        <button className={btnPrimary} onClick={save} disabled={saving} data-testid="save-prompt">
          {saving ? "Sparar…" : `Spara som v${(versions[0]?.version ?? 0) + 1}`}
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-900/60 bg-amber-950/20 p-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-400">
              <span className="font-semibold">[{w.rule}]</span> {w.message}
            </p>
          ))}
        </div>
      )}

      <div>
        <span className={labelCls}>Kompilerad prompt</span>
        <pre
          className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-[11px] leading-relaxed text-zinc-300"
          data-testid="compiled-prompt"
        >
          {compiled || "— tomt: ge shoten en beskrivning eller lägg kedjesteg —"}
        </pre>
      </div>
    </div>
  );
}
