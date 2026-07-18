"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Shot, Variant } from "@/lib/types";
import { Chip, SHOT_STATUS_COLOR, SHOT_STATUS_LABEL } from "./ui";

export function pickShotImage(shot: Shot, variants: Variant[]): Variant | null {
  const ofShot = variants.filter((v) => v.shot_id === shot.id);
  const selected = ofShot.find((v) => v.id === shot.selected_variant_id);
  if (selected) return selected;
  const kept = ofShot.filter((v) => v.status === "kept");
  if (kept.length) return kept[kept.length - 1];
  const fresh = ofShot.filter((v) => v.status !== "rejected");
  return fresh.length ? fresh[fresh.length - 1] : null;
}

interface Props {
  shot: Shot;
  variants: Variant[];
  isSelected: boolean;
  batchMode: boolean;
  batchChecked: boolean;
  onSelect: () => void;
  onBatchCheck: (checked: boolean) => void;
}

export function ShotCard({
  shot,
  variants,
  isSelected,
  batchMode,
  batchChecked,
  onSelect,
  onBatchCheck,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `shot:${shot.id}`,
  });
  const img = pickShotImage(shot, variants);
  const count = variants.filter((v) => v.shot_id === shot.id).length;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (batchMode) onBatchCheck(!batchChecked);
        else onSelect();
      }}
      className={`w-52 shrink-0 cursor-pointer rounded-lg border bg-zinc-900 transition-shadow ${
        isDragging ? "opacity-40" : ""
      } ${
        isSelected
          ? "border-emerald-500 shadow-lg shadow-emerald-900/40"
          : batchChecked
            ? "border-amber-500"
            : "border-zinc-800 hover:border-zinc-600"
      }`}
      data-testid={`shot-card-${shot.id}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-t-lg bg-zinc-950">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.media_url} alt={shot.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            ingen bild
          </div>
        )}
        {batchMode && (
          <div className="absolute left-2 top-2">
            <input
              type="checkbox"
              checked={batchChecked}
              onChange={(e) => onBatchCheck(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 accent-amber-500"
            />
          </div>
        )}
        {count > 0 && (
          <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-200">
            {count} var.
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="truncate text-xs font-medium text-zinc-200">
          {shot.title || "Namnlös shot"}
        </div>
        <Chip className={SHOT_STATUS_COLOR[shot.status]}>{SHOT_STATUS_LABEL[shot.status]}</Chip>
      </div>
    </div>
  );
}
