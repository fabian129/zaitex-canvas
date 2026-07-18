"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Scene, Shot, Variant } from "@/lib/types";
import { ShotCard } from "./ShotCard";
import { btnGhost, inputCls } from "./ui";

interface Props {
  scene: Scene;
  shots: Shot[];
  variants: Variant[];
  selectedShotId: string | null;
  batchMode: boolean;
  batchChecked: Set<string>;
  onSelectShot: (id: string) => void;
  onBatchCheck: (id: string, checked: boolean) => void;
  onAddShot: (sceneId: string) => void;
  onRenameScene: (sceneId: string, title: string, beat: string | null) => void;
  onDeleteScene: (sceneId: string) => void;
}

export function SceneRow(props: Props) {
  const { scene, shots } = props;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(scene.title);
  const [beat, setBeat] = useState(scene.beat ?? "");

  const sortable = useSortable({ id: `scene:${scene.id}` });
  const drop = useDroppable({ id: `scenedrop:${scene.id}` });

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className={`rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 ${
        sortable.isDragging ? "opacity-40" : ""
      }`}
      data-testid={`scene-row-${scene.id}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          className="cursor-grab rounded px-1 text-zinc-600 hover:text-zinc-300"
          title="Dra för att ordna om scener"
        >
          ⠿
        </button>
        {editing ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              props.onRenameScene(scene.id, title, beat || null);
              setEditing(false);
            }}
          >
            <input
              className={`${inputCls} max-w-56`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Scenens namn"
              autoFocus
            />
            <input
              className={`${inputCls} max-w-40`}
              value={beat}
              onChange={(e) => setBeat(e.target.value)}
              placeholder="beat (t.ex. hook)"
            />
            <button className={btnGhost} type="submit">
              Spara
            </button>
          </form>
        ) : (
          <button
            className="flex-1 text-left text-sm font-semibold text-zinc-100 hover:text-emerald-400"
            onClick={() => setEditing(true)}
            title="Klicka för att byta namn / beat"
          >
            {scene.title || "Namnlös scen"}
            {scene.beat && (
              <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal text-zinc-400">
                {scene.beat}
              </span>
            )}
            <span className="ml-2 text-xs font-normal text-zinc-500">{shots.length} shots</span>
          </button>
        )}
        <button className={btnGhost} onClick={() => props.onAddShot(scene.id)}>
          + Shot
        </button>
        <button
          className="rounded px-2 py-1 text-xs text-zinc-600 hover:text-red-400"
          onClick={() => props.onDeleteScene(scene.id)}
          title="Ta bort scen"
        >
          ✕
        </button>
      </div>

      <div
        ref={drop.setNodeRef}
        className={`flex min-h-[9.5rem] gap-3 overflow-x-auto rounded-lg p-1 ${
          drop.isOver ? "bg-emerald-950/30 ring-1 ring-emerald-700" : ""
        }`}
      >
        <SortableContext
          items={shots.map((s) => `shot:${s.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          {shots.map((shot) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              variants={props.variants}
              isSelected={props.selectedShotId === shot.id}
              batchMode={props.batchMode}
              batchChecked={props.batchChecked.has(shot.id)}
              onSelect={() => props.onSelectShot(shot.id)}
              onBatchCheck={(c) => props.onBatchCheck(shot.id, c)}
            />
          ))}
        </SortableContext>
        {shots.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
            Tom scen — lägg till en shot eller dra hit en.
          </div>
        )}
      </div>
    </div>
  );
}
