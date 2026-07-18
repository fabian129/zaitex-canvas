"use client";

// Projektlistan: klient-scopade storyboard-projekt (relaterar till leverans.clients
// och studio.content_plans/content_items — canvasen uppfinner inga parallellstrukturer).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { verb } from "@/lib/api";
import type { Project } from "@/lib/types";
import { btnPrimary, inputCls, labelCls } from "@/components/canvas/ui";

const FORMATS = ["16:9", "9:16", "1:1", "4:5"];

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("16:9");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("cv_projects")
      .select("*")
      .order("created_at", { ascending: false });
    setProjects((data as Project[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Zaitex Canvas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Storyboard-canvasen — scener · shots · souls · promptkedjor · batchgrind. Motorerna är
          mock-adapters tills de riktiga skruvas i via seamen.
        </p>
      </header>

      <form
        className="mb-8 flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setCreating(true);
          try {
            const res = await verb<{ id: string }>("cv_project_create", {
              p_title: title.trim(),
              p_format: format,
            });
            window.location.href = `/p/${res.id}`;
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
            setCreating(false);
          }
        }}
      >
        <div className="flex-1">
          <label className={labelCls}>Nytt projekt</label>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="t.ex. Bodyfight — lanseringsreel v1"
            data-testid="new-project-title"
          />
        </div>
        <div>
          <label className={labelCls}>Format</label>
          <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <button className={btnPrimary} disabled={creating} data-testid="create-project">
          {creating ? "Skapar…" : "Skapa"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Laddar…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-zinc-500">Inga projekt än — skapa det första ovan.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/p/${p.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-emerald-700"
                data-testid={`project-link-${p.id}`}
              >
                <div>
                  <span className="font-semibold">{p.title}</span>
                  {p.content_plan_id && (
                    <span className="ml-2 rounded bg-sky-950 px-1.5 py-0.5 text-[10px] text-sky-300">
                      content-plan kopplad
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  {p.format} · {p.status} · {p.created_at.slice(0, 10)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
