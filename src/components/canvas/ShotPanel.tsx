"use client";

// Vald shot: fält (recept + kamera/ljus/rörelse), kopplade souls,
// variant-stacken (kurering) och prompt-panelen (kedjan).

import { useEffect, useState } from "react";
import type { Scene, Shot, ShotSoul, Soul, Variant } from "@/lib/types";
import { verb } from "@/lib/api";
import { PromptPanel } from "./PromptPanel";
import { VariantStack } from "./VariantStack";
import { Chip, btnGhost, inputCls, labelCls } from "./ui";

export function ShotPanel({
  shot,
  scenes,
  souls,
  shotSouls,
  variants,
  onChanged,
}: {
  shot: Shot;
  scenes: Scene[];
  souls: Soul[];
  shotSouls: ShotSoul[];
  variants: Variant[];
  onChanged: () => void;
}) {
  const [fields, setFields] = useState({
    title: shot.title,
    description: shot.description,
    camera: shot.camera,
    light: shot.light,
    motion: shot.motion,
    duration: String(shot.duration),
  });
  useEffect(() => {
    setFields({
      title: shot.title,
      description: shot.description,
      camera: shot.camera,
      light: shot.light,
      motion: shot.motion,
      duration: String(shot.duration),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

  const linkedSouls = shotSouls
    .filter((ss) => ss.shot_id === shot.id)
    .map((ss) => souls.find((s) => s.id === ss.soul_id))
    .filter((s): s is Soul => Boolean(s));

  const saveFields = async () => {
    await verb("cv_shot_set", {
      p_shot_id: shot.id,
      p_title: fields.title,
      p_description: fields.description,
      p_camera: fields.camera,
      p_light: fields.light,
      p_motion: fields.motion,
      p_duration: parseFloat(fields.duration) || 3.0,
    });
    onChanged();
  };

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields({ ...fields, [k]: e.target.value });

  return (
    <div className="space-y-4" data-testid="shot-panel">
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <div>
          <label className={labelCls}>Shot</label>
          <input className={inputCls} value={fields.title} onChange={set("title")} onBlur={saveFields} placeholder="Shotens namn" data-testid="shot-title-input" />
        </div>
        <div>
          <label className={labelCls}>Sek</label>
          <input className={inputCls} value={fields.duration} onChange={set("duration")} onBlur={saveFields} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Recept (beskrivningen)</label>
        <textarea className={`${inputCls} min-h-16`} value={fields.description} onChange={set("description")} onBlur={saveFields} placeholder="Vad ska hända i bilden…" data-testid="shot-description-input" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Kamera</label>
          <input className={inputCls} value={fields.camera} onChange={set("camera")} onBlur={saveFields} placeholder="low angle…" data-testid="shot-camera-input" />
        </div>
        <div>
          <label className={labelCls}>Ljus</label>
          <input className={inputCls} value={fields.light} onChange={set("light")} onBlur={saveFields} placeholder="gryning…" />
        </div>
        <div>
          <label className={labelCls}>Rörelse</label>
          <input className={inputCls} value={fields.motion} onChange={set("motion")} onBlur={saveFields} placeholder="slow push…" />
        </div>
      </div>

      <div>
        <span className={labelCls}>Souls på shoten</span>
        <div className="flex flex-wrap gap-1.5">
          {linkedSouls.map((s) => (
            <Chip key={s.id} className="bg-sky-950 text-sky-300">
              {s.name}
              <button
                className="ml-1.5 text-sky-500 hover:text-red-400"
                onClick={() =>
                  void verb("cv_shot_soul_unlink", { p_shot_id: shot.id, p_soul_id: s.id }).then(onChanged)
                }
              >
                ✕
              </button>
            </Chip>
          ))}
          {linkedSouls.length === 0 && (
            <span className="text-[11px] text-zinc-600">
              inga — koppla från Souls-fliken (identitet in i prompten)
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={labelCls}>Flytta till scen</span>
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
          value={shot.scene_id}
          onChange={async (e) => {
            const targetScene = e.target.value;
            if (targetScene === shot.scene_id) return;
            await verb("cv_shot_reorder", { p_scene_id: targetScene, p_shot_ids: [shot.id] });
            onChanged();
          }}
        >
          {scenes.map((sc) => (
            <option key={sc.id} value={sc.id}>
              {sc.title || "namnlös scen"}
            </option>
          ))}
        </select>
        <button
          className={`${btnGhost} ml-auto text-red-300`}
          onClick={() => {
            if (confirm("Ta bort shoten (med varianter och prompthistorik)?"))
              void verb("cv_remove", { p_kind: "shot", p_id: shot.id }).then(onChanged);
          }}
        >
          Ta bort shot
        </button>
      </div>

      <hr className="border-zinc-800" />
      <div>
        <span className={labelCls}>Variant-stacken (kurering)</span>
        <VariantStack shot={shot} variants={variants} onChanged={onChanged} />
      </div>

      <hr className="border-zinc-800" />
      <PromptPanel shot={shot} souls={linkedSouls} onSaved={onChanged} />
    </div>
  );
}
