"use client";

// Projektlistan: klient-scopade storyboard-projekt (relaterar till leverans.clients
// och studio.content_plans/content_items — canvasen uppfinner inga parallellstrukturer).
// Studio-kopplingen: projekt föds ur riktiga klienter/planer/items via cv_*-läsvyerna;
// studio deep-linkar in per item via /from-item/<content_item_id>.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { verb } from "@/lib/api";
import type { Project, StudioClient, StudioContentItem, StudioContentPlan } from "@/lib/types";
import { btnPrimary, inputCls, labelCls } from "@/components/canvas/ui";

const FORMATS = ["16:9", "9:16", "1:1", "4:5"];

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<StudioClient[]>([]);
  const [plans, setPlans] = useState<StudioContentPlan[]>([]);
  const [items, setItems] = useState<StudioContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("16:9");
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [itemId, setItemId] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [proj, cl, pl, it] = await Promise.all([
      sb.from("cv_projects").select("*").order("created_at", { ascending: false }),
      sb.from("cv_clients").select("*").order("name"),
      sb.from("cv_content_plans").select("*").order("campaign_name"),
      sb.from("cv_content_items").select("*").order("title"),
    ]);
    setProjects((proj.data as Project[]) ?? []);
    setClients((cl.data as StudioClient[]) ?? []);
    setPlans((pl.data as StudioContentPlan[]) ?? []);
    setItems((it.data as StudioContentItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visiblePlans = clientId ? plans.filter((p) => p.client_id === clientId) : plans;
  const visibleItems = items.filter(
    (i) => (!clientId || i.client_id === clientId) && (!planId || i.content_plan_id === planId)
  );

  const pickItem = (id: string) => {
    setItemId(id);
    const item = items.find((i) => i.id === id);
    if (item) {
      setClientId(item.client_id);
      if (item.content_plan_id) setPlanId(item.content_plan_id);
      if (!title.trim() && item.title) setTitle(item.title);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Zaitex Canvas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Storyboard-canvasen — scener · shots · souls · promptkedjor · batchgrind. Projekt föds
          ur studios klienter, content-planer och items.
        </p>
      </header>

      <form
        className="mb-8 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setCreating(true);
          try {
            const res = await verb<{ id: string }>("cv_project_create", {
              p_title: title.trim(),
              p_format: format,
              p_client_id: clientId || null,
              p_content_plan_id: planId || null,
              p_content_item_id: itemId || null,
            });
            window.location.href = `/p/${res.id}`;
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
            setCreating(false);
          }
        }}
      >
        <div className="flex items-end gap-2">
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
        </div>
        {/* Studio-kopplingen: klient → plan → item (item fyller klient/plan/titel själv) */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Klient</label>
            <select
              className={`${inputCls} text-xs`}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPlanId("");
                setItemId("");
              }}
              data-testid="new-project-client"
            >
              <option value="">— ingen —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Content-plan</label>
            <select
              className={`${inputCls} text-xs`}
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                setItemId("");
                const plan = plans.find((p) => p.id === e.target.value);
                if (plan) setClientId(plan.client_id);
              }}
              data-testid="new-project-plan"
            >
              <option value="">— ingen —</option>
              {visiblePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.campaign_name || p.month || p.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Content-item</label>
            <select
              className={`${inputCls} text-xs`}
              value={itemId}
              onChange={(e) => pickItem(e.target.value)}
              data-testid="new-project-item"
            >
              <option value="">— inget —</option>
              {visibleItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title || i.content_type || i.id.slice(0, 8)}
                  {i.platform ? ` (${i.platform})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Laddar…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-zinc-500">Inga projekt än — skapa det första ovan.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => {
            const client = clients.find((c) => c.id === p.client_id);
            return (
              <li key={p.id}>
                <Link
                  href={`/p/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-emerald-700"
                  data-testid={`project-link-${p.id}`}
                >
                  <div>
                    <span className="font-semibold">{p.title}</span>
                    {client && (
                      <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                        {client.name}
                      </span>
                    )}
                    {p.content_plan_id && (
                      <span className="ml-2 rounded bg-sky-950 px-1.5 py-0.5 text-[10px] text-sky-300">
                        content-plan
                      </span>
                    )}
                    {p.content_item_id && (
                      <span className="ml-1 rounded bg-violet-950 px-1.5 py-0.5 text-[10px] text-violet-300">
                        item
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">
                    {p.format} · {p.status} · {p.created_at.slice(0, 10)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
