"use client";

// MOODBOARD-BRÄDET (prototyp-ytan): allt som rör design går genom canvasen.
// Intag: URL, fil (bild/video/HTML-komponent) eller notis — manuellt eller via
// agent-seamen (cv_mood_intake: Stitch MCP, Paper, Pencil...). Kurering med
// behåll/förkasta, och promotering vidare till biblioteket i studio
// (cv_mood_promote → promoted_at läses av studio-sidan).

import { useState } from "react";
import Link from "next/link";
import { verb } from "@/lib/api";
import { useMoodboardData } from "@/hooks/useMoodboardData";
import type { MoodKind, MoodboardItem } from "@/lib/types";
import { Chip, btnDanger, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/canvas/ui";

const KIND_LABEL: Record<MoodKind, string> = {
  image: "bild",
  video: "video",
  link: "länk",
  embed: "embed",
  html: "komponent (html)",
  note: "notis",
};

const LIVE_LABEL: Record<string, string> = {
  connecting: "ansluter…",
  live: "live",
  bridge: "live (brygga)",
  poll: "poll",
};

function ItemMedia({ item }: { item: MoodboardItem }) {
  const url = item.media_url ?? "";
  switch (item.kind) {
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={item.title ?? ""} className="w-full rounded-t-xl object-cover" />
      );
    case "video":
      return <video src={url} controls muted className="w-full rounded-t-xl" />;
    case "html":
    case "embed":
      // Sandboxad rendering: komponenten/prototypen körs, men utan same-origin-åtkomst.
      return (
        <iframe
          src={url}
          sandbox="allow-scripts"
          className="h-64 w-full rounded-t-xl border-0 bg-white"
          title={item.title ?? item.kind}
        />
      );
    case "link":
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block break-all rounded-t-xl bg-zinc-800/60 px-3 py-4 text-xs text-sky-300 hover:underline"
        >
          {url}
        </a>
      );
    case "note":
      return null;
  }
}

function ItemCard({ item, onChanged }: { item: MoodboardItem; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  // Egna mutationer refetchar direkt — realtime täcker externa händelser.
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const border =
    item.status === "kept"
      ? "border-emerald-700"
      : item.status === "rejected"
        ? "border-zinc-800 opacity-50"
        : "border-zinc-800";

  return (
    <div
      className={`mb-3 break-inside-avoid rounded-xl border bg-zinc-900/60 ${border}`}
      data-testid="mood-card"
    >
      <ItemMedia item={item} />
      <div className="space-y-2 p-3">
        {(item.title || item.caption) && (
          <div>
            {item.title && <p className="text-sm font-semibold">{item.title}</p>}
            {item.caption && <p className="text-xs text-zinc-400">{item.caption}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className="bg-zinc-800 text-zinc-400">{KIND_LABEL[item.kind]}</Chip>
          <Chip className="bg-sky-950 text-sky-300" data-testid="mood-source">
            {item.source}
          </Chip>
          {item.status === "kept" && <Chip className="bg-emerald-950 text-emerald-300">behållen</Chip>}
          {item.status === "rejected" && <Chip className="bg-zinc-800 text-zinc-500">förkastad</Chip>}
          {item.promoted_at && (
            <Chip className="bg-violet-950 text-violet-300" data-testid="mood-promoted">
              → {item.promoted_to ?? "bibliotek"}
            </Chip>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.status !== "kept" && (
            <button
              className={`${btnGhost} !px-2 !py-1 !text-xs`}
              disabled={busy}
              onClick={() => act(() => verb("cv_mood_curate", { p_item_id: item.id, p_status: "kept" }))}
            >
              Behåll
            </button>
          )}
          {item.status !== "rejected" && (
            <button
              className={`${btnGhost} !px-2 !py-1 !text-xs`}
              disabled={busy}
              onClick={() =>
                act(() => verb("cv_mood_curate", { p_item_id: item.id, p_status: "rejected" }))
              }
            >
              Förkasta
            </button>
          )}
          {!item.promoted_at && item.status !== "rejected" && (
            <button
              className={`${btnPrimary} !px-2 !py-1 !text-xs`}
              disabled={busy}
              onClick={() => act(() => verb("cv_mood_promote", { p_item_id: item.id }))}
            >
              Promota
            </button>
          )}
          <button
            className={`${btnDanger} !px-2 !py-1 !text-xs`}
            disabled={busy}
            onClick={() => {
              if (!confirm("Ta bort ur moodboardet?")) return;
              void act(() => verb("cv_remove", { p_kind: "mood_item", p_id: item.id }));
            }}
          >
            Ta bort
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MoodboardCanvas({ moodboardId }: { moodboardId: string }) {
  const { data, loading, status, refetch } = useMoodboardData(moodboardId);
  const [kind, setKind] = useState<MoodKind>("image");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [adding, setAdding] = useState(false);

  if (loading) return <p className="p-8 text-sm text-zinc-500">Laddar…</p>;
  if (!data.board)
    return (
      <div className="p-8">
        <p className="text-sm text-red-400">Okänt moodboard.</p>
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          ← Till startsidan
        </Link>
      </div>
    );

  const client = data.clients.find((c) => c.id === data.board?.client_id);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await verb("cv_mood_intake", {
        p_moodboard_id: moodboardId,
        p_kind: kind,
        p_media_url: kind === "note" ? null : url.trim(),
        p_title: title.trim() || null,
        p_caption: caption.trim() || null,
        p_source: "manual",
      });
      setUrl("");
      setTitle("");
      setCaption("");
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const uploadFile = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("moodboard_id", moodboardId);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok || body?.ok === false) alert(body?.error ?? "uppladdning misslyckades");
    else await refetch();
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Alla projekt
          </Link>
          <h1 className="mt-1 text-xl font-bold" data-testid="moodboard-title">
            {data.board.title}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Chip className="bg-zinc-800 text-zinc-400">moodboard</Chip>
            {client && <Chip className="bg-zinc-800 text-zinc-300">{client.name}</Chip>}
            {data.board.status === "archived" && (
              <Chip className="bg-zinc-800 text-zinc-500">arkiverat</Chip>
            )}
          </div>
          {data.board.note && <p className="mt-2 max-w-xl text-xs text-zinc-500">{data.board.note}</p>}
        </div>
        <Chip className="bg-zinc-800 text-zinc-400" data-testid="live-status">
          {LIVE_LABEL[status] ?? status}
        </Chip>
      </header>

      <form
        className="mb-6 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
        onSubmit={addItem}
      >
        <div className="grid grid-cols-[110px_1fr_180px_auto] items-end gap-2">
          <div>
            <label className={labelCls}>Typ</label>
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as MoodKind)}
              data-testid="mood-intake-kind"
            >
              {(Object.keys(KIND_LABEL) as MoodKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{kind === "note" ? "Rubrik" : "URL"}</label>
            {kind === "note" ? (
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="notisens rubrik"
                data-testid="mood-intake-title"
              />
            ) : (
              <input
                className={inputCls}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… eller /uploads/…"
                data-testid="mood-intake-url"
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Kommentar</label>
            <input
              className={inputCls}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="valfri"
              data-testid="mood-intake-caption"
            />
          </div>
          <button className={btnPrimary} disabled={adding} data-testid="mood-intake-add">
            {adding ? "Lägger till…" : "Lägg till"}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>…eller släpp in en fil (bild, video, HTML-komponent):</span>
          <input
            type="file"
            className="text-xs"
            data-testid="mood-upload-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </form>

      {data.items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Tomt bräde — lägg till ovan, eller låt en agent skjuta in kurerat material via
          cv_mood_intake.
        </p>
      ) : (
        <div className="columns-2 gap-3 md:columns-3 xl:columns-4" data-testid="mood-grid">
          {data.items.map((item) => (
            <ItemCard key={item.id} item={item} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
