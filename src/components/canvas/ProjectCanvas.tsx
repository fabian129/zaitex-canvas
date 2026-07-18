"use client";

// CANVASEN: projekt → scener → shots i ordnad grid (drag-omordning),
// kurering, souls, promptkedjor, batchgrind, intag, export — allt live via Realtime.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useCanvasData } from "@/hooks/useCanvasData";
import { verb } from "@/lib/api";
import type { Shot } from "@/lib/types";
import { BatchPanel } from "./BatchPanel";
import { IntakePanel } from "./IntakePanel";
import { SceneRow } from "./SceneRow";
import { ShotPanel } from "./ShotPanel";
import { SoulPanel } from "./SoulPanel";
import { btnGhost, btnPrimary, inputCls } from "./ui";

type Tab = "shot" | "souls" | "intag" | "batch";

export function ProjectCanvas({ projectId }: { projectId: string }) {
  const { data, setData, loading, status, refetch } = useCanvasData(projectId);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("intag");
  const [batchMode, setBatchMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [batchEngine, setBatchEngine] = useState("mock-nano-banana");
  const [batchCap, setBatchCap] = useState("10");
  const [batchBudget, setBatchBudget] = useState(""); // tom = inget kostnadstak

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const shotsByScene = useMemo(() => {
    const map = new Map<string, Shot[]>();
    for (const scene of data.scenes) {
      map.set(
        scene.id,
        data.shots
          .filter((s) => s.scene_id === scene.id)
          .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      );
    }
    return map;
  }, [data.scenes, data.shots]);

  const selectedShot = data.shots.find((s) => s.id === selectedShotId) ?? null;

  const selectShot = (id: string) => {
    setSelectedShotId(id);
    setTab("shot");
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    if (activeId.startsWith("scene:")) {
      const from = data.scenes.findIndex((s) => `scene:${s.id}` === activeId);
      const to = data.scenes.findIndex(
        (s) => `scene:${s.id}` === overId || `scenedrop:${s.id}` === overId
      );
      if (from < 0 || to < 0) return;
      const next = arrayMove(data.scenes, from, to);
      setData({ ...data, scenes: next });
      await verb("cv_scene_reorder", {
        p_project_id: projectId,
        p_scene_ids: next.map((s) => s.id),
      });
      void refetch();
      return;
    }

    if (activeId.startsWith("shot:")) {
      const shotId = activeId.slice(5);
      const shot = data.shots.find((s) => s.id === shotId);
      if (!shot) return;
      let targetSceneId: string | null = null;
      let insertIndex = -1;
      if (overId.startsWith("scenedrop:")) {
        targetSceneId = overId.slice(10);
        insertIndex = (shotsByScene.get(targetSceneId) ?? []).length;
      } else if (overId.startsWith("shot:")) {
        const overShot = data.shots.find((s) => s.id === overId.slice(5));
        if (!overShot) return;
        targetSceneId = overShot.scene_id;
        insertIndex = (shotsByScene.get(targetSceneId) ?? []).findIndex((s) => s.id === overShot.id);
      }
      if (!targetSceneId || insertIndex < 0) return;

      const sourceSceneId = shot.scene_id;
      const targetList = (shotsByScene.get(targetSceneId) ?? []).filter((s) => s.id !== shotId);
      targetList.splice(insertIndex, 0, shot);
      const targetIds = targetList.map((s) => s.id);

      // optimistisk lokal omordning; servern är sanningen strax efter
      setData({
        ...data,
        shots: data.shots.map((s) => {
          const ti = targetIds.indexOf(s.id);
          if (ti >= 0) return { ...s, scene_id: targetSceneId, position: ti };
          return s;
        }),
      });
      await verb("cv_shot_reorder", { p_scene_id: targetSceneId, p_shot_ids: targetIds });
      if (sourceSceneId !== targetSceneId) {
        const remaining = (shotsByScene.get(sourceSceneId) ?? [])
          .filter((s) => s.id !== shotId)
          .map((s) => s.id);
        if (remaining.length)
          await verb("cv_shot_reorder", { p_scene_id: sourceSceneId, p_shot_ids: remaining });
      }
      void refetch();
    }
  };

  const engineCost =
    data.engineCosts.find((c) => c.engine === batchEngine)?.cost_units ?? 1;

  const createBatch = async () => {
    const ids = [...checked];
    if (!ids.length) return;
    try {
      await verb("cv_batch_create", {
        p_project_id: projectId,
        p_shot_ids: ids,
        p_engine: batchEngine,
        p_cap_max_jobs: parseInt(batchCap, 10) || 10,
        p_cap_max_cost: batchBudget.trim() === "" ? null : parseFloat(batchBudget) || 0,
      });
      setBatchMode(false);
      setChecked(new Set());
      setTab("batch");
      void refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        Laddar canvasen…
      </div>
    );
  }
  if (!data.project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
        <p>Projektet hittades inte.</p>
        <Link href="/" className="text-emerald-400 underline">
          ‹ Till projektlistan
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Verktygsraden */}
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-200">
          ‹ Projekt
        </Link>
        <h1 className="truncate text-base font-bold" data-testid="project-title">
          {data.project.title}
        </h1>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            status === "live" || status === "bridge"
              ? "bg-emerald-950 text-emerald-400"
              : status === "poll"
                ? "bg-amber-950 text-amber-400"
                : "bg-zinc-800 text-zinc-400"
          }`}
          data-testid="live-status"
          title="Liveness: live = Supabase Realtime · brygga = DB-push via SSE · polling = fallback"
        >
          {status === "live"
            ? "● live"
            : status === "bridge"
              ? "● live (brygga)"
              : status === "poll"
                ? "◌ polling"
                : "… kopplar"}
        </span>
        <span className="text-[11px] text-zinc-600">{data.project.format}</span>

        <div className="ml-auto flex items-center gap-2">
          {!batchMode ? (
            <button className={btnGhost} onClick={() => setBatchMode(true)} data-testid="batch-mode-toggle">
              Markera för batch
            </button>
          ) : (
            <>
              <span className="text-xs text-amber-400">
                {checked.size} markerade · ~{checked.size * engineCost} ku
              </span>
              <select
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs"
                value={batchEngine}
                onChange={(e) => setBatchEngine(e.target.value)}
                data-testid="batch-engine-select"
              >
                <option value="mock-nano-banana">mock-nano-banana (bild)</option>
                <option value="mock-higgsfield">mock-higgsfield (video)</option>
                <option value="mock-higgsfield-async">mock-higgsfield-async (video, webhook)</option>
              </select>
              <input
                className={`${inputCls} w-16 text-xs`}
                value={batchCap}
                onChange={(e) => setBatchCap(e.target.value)}
                title="Tak: max antal jobb som godkännandet släpper igenom"
                data-testid="batch-cap-input"
              />
              <input
                className={`${inputCls} w-20 text-xs`}
                value={batchBudget}
                onChange={(e) => setBatchBudget(e.target.value)}
                placeholder="budget ku"
                title="Kostnadstak (kostnadsenheter): grinden skippar allt över budgeten i DB. Tomt = inget kostnadstak."
                data-testid="batch-budget-input"
              />
              <button
                className={btnPrimary}
                disabled={checked.size === 0}
                onClick={createBatch}
                data-testid="create-batch"
              >
                Skapa batch ({checked.size})
              </button>
              <button
                className={btnGhost}
                onClick={() => {
                  setBatchMode(false);
                  setChecked(new Set());
                }}
              >
                Avbryt
              </button>
            </>
          )}
          <a
            className={btnGhost}
            href={`/api/export/${projectId}`}
            target="_blank"
            rel="noreferrer"
            data-testid="export-storyboard"
          >
            Storyboard
          </a>
          <a className={btnGhost} href={`/api/export/${projectId}?format=shotlist`} data-testid="export-shotlist">
            Shotlista
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Brädet */}
        <main className="min-w-0 flex-1 space-y-4 overflow-auto p-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={data.scenes.map((s) => `scene:${s.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {data.scenes.map((scene) => (
                <SceneRow
                  key={scene.id}
                  scene={scene}
                  shots={shotsByScene.get(scene.id) ?? []}
                  variants={data.variants}
                  selectedShotId={selectedShotId}
                  batchMode={batchMode}
                  batchChecked={checked}
                  onSelectShot={selectShot}
                  onBatchCheck={(id, c) => {
                    const next = new Set(checked);
                    if (c) next.add(id);
                    else next.delete(id);
                    setChecked(next);
                  }}
                  onAddShot={async (sceneId) => {
                    await verb("cv_shot_add", { p_scene_id: sceneId, p_title: "" });
                    void refetch();
                  }}
                  onRenameScene={async (sceneId, title, beat) => {
                    await verb("cv_scene_set", { p_scene_id: sceneId, p_title: title, p_beat: beat });
                    void refetch();
                  }}
                  onDeleteScene={(sceneId) => {
                    if (confirm("Ta bort scenen med alla shots?"))
                      void verb("cv_remove", { p_kind: "scene", p_id: sceneId }).then(() => refetch());
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            className={`${btnGhost} w-full border border-dashed border-zinc-700 py-3`}
            onClick={async () => {
              await verb("cv_scene_add", { p_project_id: projectId, p_title: `Scen ${data.scenes.length + 1}` });
              void refetch();
            }}
            data-testid="add-scene"
          >
            + Ny scen
          </button>
        </main>

        {/* Sidopanelen */}
        <aside className="flex w-[26rem] shrink-0 flex-col border-l border-zinc-800">
          <nav className="flex border-b border-zinc-800">
            {(
              [
                ["shot", "Shot"],
                ["souls", "Souls"],
                ["intag", "Intag"],
                ["batch", "Batch"],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                  tab === t
                    ? "border-b-2 border-emerald-500 text-emerald-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                onClick={() => setTab(t)}
                data-testid={`tab-${t}`}
              >
                {label}
                {t === "batch" &&
                  data.batches.some((b) => b.status === "pending_approval") && (
                    <span className="ml-1 text-amber-400">●</span>
                  )}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "shot" &&
              (selectedShot ? (
                <ShotPanel
                  shot={selectedShot}
                  scenes={data.scenes}
                  shots={data.shots}
                  souls={data.souls}
                  shotSouls={data.shotSouls}
                  shotRefs={data.shotRefs}
                  variants={data.variants}
                  onChanged={() => void refetch()}
                />
              ) : (
                <p className="text-xs text-zinc-500">Klicka på en shot i brädet.</p>
              ))}
            {tab === "souls" && (
              <SoulPanel
                souls={data.souls}
                shotSouls={data.shotSouls}
                selectedShot={selectedShot}
                onChanged={() => void refetch()}
              />
            )}
            {tab === "intag" && (
              <IntakePanel
                projectId={projectId}
                variants={data.variants}
                selectedShot={selectedShot}
                onChanged={() => void refetch()}
              />
            )}
            {tab === "batch" && (
              <BatchPanel
                batches={data.batches}
                batchItems={data.batchItems}
                shots={data.shots}
                engineCosts={data.engineCosts}
                onChanged={() => void refetch()}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
