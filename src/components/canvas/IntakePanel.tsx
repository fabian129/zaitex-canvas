"use client";

// INTAGET (funktion 2): tray för oassignade varianter (shot_id = null),
// URL-pull, uppladdning, samt agent-receptet (curl) — allt landar som DB-rader
// och lyfts in live via Realtime.

import { useRef, useState } from "react";
import type { Shot, Variant } from "@/lib/types";
import { intakeUrlPull, uploadFile, verb } from "@/lib/api";
import { btnGhost, btnPrimary, inputCls, labelCls } from "./ui";

export function IntakePanel({
  projectId,
  variants,
  selectedShot,
  onChanged,
}: {
  projectId: string;
  variants: Variant[];
  selectedShot: Shot | null;
  onChanged: () => void;
}) {
  const tray = variants.filter((v) => v.shot_id === null);
  const [pullUrl, setPullUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCurl, setShowCurl] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const curl = `curl -X POST ${origin}/api/intake \\
  -H 'Content-Type: application/json' \\
  -d '{"project_id":"${projectId}","media_url":"https://…","prompt":"valfri anteckning"}'
# shot_id: … läggs till för att sikta på en specifik shot; utan hamnar bilden i trayn.
# Agenter med DB-åtkomst: select cv_intake(<verb-nyckel>, '${projectId}', 'https://…');`;

  return (
    <div className="space-y-4" data-testid="intake-panel">
      <div>
        <span className={labelCls}>URL-pull</span>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pullUrl.trim()) return;
            setBusy(true);
            try {
              await intakeUrlPull(projectId, pullUrl.trim(), selectedShot?.id);
              setPullUrl("");
              onChanged();
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            className={inputCls}
            value={pullUrl}
            onChange={(e) => setPullUrl(e.target.value)}
            placeholder="https://…/bild.jpg — hämtas till storage"
            data-testid="pull-url-input"
          />
          <button className={btnPrimary} disabled={busy} data-testid="pull-url-submit">
            Hämta
          </button>
        </form>
        <p className="mt-1 text-[10px] text-zinc-600">
          {selectedShot ? `Landar på vald shot: ${selectedShot.title || "namnlös"}` : "Landar i trayn (ingen shot vald)."}
        </p>
      </div>

      <div>
        <span className={labelCls}>Uppladdning</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="block w-full text-xs text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200 hover:file:bg-zinc-700"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              await uploadFile(projectId, file, selectedShot?.id);
              if (fileRef.current) fileRef.current.value = "";
              onChanged();
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>

      <div>
        <button
          className="text-[11px] text-zinc-500 underline hover:text-zinc-300"
          onClick={() => setShowCurl(!showCurl)}
        >
          {showCurl ? "Dölj" : "Visa"} agent-receptet (HTTP-intag)
        </button>
        {showCurl && (
          <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[10px] leading-relaxed text-zinc-400">
            {curl}
          </pre>
        )}
      </div>

      <div>
        <span className={labelCls}>Intags-tray ({tray.length})</span>
        {tray.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Tomt. Bilder som tas in utan shot hamnar här och kan sedan sättas på en shot.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tray.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5"
                data-testid={`tray-item-${v.id}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.media_url}
                  alt="tray"
                  className="aspect-video w-full rounded object-cover bg-zinc-950"
                />
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] text-zinc-500">{v.source}</span>
                  <div className="flex gap-1">
                    <button
                      className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-800 disabled:opacity-40"
                      disabled={!selectedShot}
                      title={selectedShot ? "Sätt på vald shot" : "Välj en shot först"}
                      onClick={() =>
                        selectedShot &&
                        void verb("cv_variant_assign", {
                          p_variant_id: v.id,
                          p_shot_id: selectedShot.id,
                        }).then(onChanged)
                      }
                    >
                      → shot
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-[10px] text-zinc-600 hover:text-red-400"
                      onClick={() =>
                        void verb("cv_remove", { p_kind: "variant", p_id: v.id }).then(onChanged)
                      }
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
