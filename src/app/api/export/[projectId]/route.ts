import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { PromptVersion, Scene, Shot, ShotRef, ShotSoul, Soul, Variant } from "@/lib/types";

// EXPORT (funktion 7):
//   ?format=storyboard (default) — kundvänlig HTML, printbar → PDF via browserns skriv-ut.
//   ?format=shotlist            — shotlista som jobbfil (JSON): kompilerad prompt per shot.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "storyboard";
  const sb = supabaseServer();

  const [projRes, scenesRes, shotsRes, variantsRes, pvRes, soulsRes, shotSoulsRes, shotRefsRes] =
    await Promise.all([
      sb.from("cv_projects").select("*").eq("id", projectId).single(),
      sb.from("cv_scenes").select("*").eq("project_id", projectId).order("position"),
      sb.from("cv_shots").select("*").eq("project_id", projectId).order("position"),
      sb.from("cv_variants").select("*").eq("project_id", projectId),
      sb.from("cv_prompt_versions").select("*"),
      sb.from("cv_souls").select("*"),
      sb.from("cv_shot_souls").select("*"),
      sb.from("cv_shot_refs").select("*").eq("project_id", projectId).order("slot"),
    ]);

  if (projRes.error || !projRes.data) {
    return NextResponse.json({ ok: false, error: "okänt projekt" }, { status: 404 });
  }
  const project = projRes.data;
  const scenes = (scenesRes.data ?? []) as Scene[];
  const shots = (shotsRes.data ?? []) as Shot[];
  const variants = (variantsRes.data ?? []) as Variant[];
  const promptVersions = (pvRes.data ?? []) as PromptVersion[];
  const souls = (soulsRes.data ?? []) as Soul[];
  const shotSouls = (shotSoulsRes.data ?? []) as ShotSoul[];
  const shotRefs = (shotRefsRes.data ?? []) as ShotRef[];

  const origin = req.nextUrl.origin;
  const abs = (url: string) => (url.startsWith("/") ? origin + url : url);

  const pickImage = (shot: Shot): Variant | null => {
    const ofShot = variants.filter((v) => v.shot_id === shot.id);
    const selected = ofShot.find((v) => v.id === shot.selected_variant_id);
    if (selected) return selected;
    const kept = ofShot.filter((v) => v.status === "kept");
    if (kept.length) return kept[kept.length - 1];
    const fresh = ofShot.filter((v) => v.status !== "rejected");
    return fresh.length ? fresh[fresh.length - 1] : null;
  };

  const soulsFor = (shot: Shot): Soul[] =>
    shotSouls
      .filter((ss) => ss.shot_id === shot.id)
      .map((ss) => souls.find((s) => s.id === ss.soul_id))
      .filter((s): s is Soul => Boolean(s));

  const currentPrompt = (shot: Shot): PromptVersion | null =>
    promptVersions.find((pv) => pv.id === shot.current_prompt_version_id) ?? null;

  if (format === "shotlist") {
    const jobfile = {
      kind: "zaitex-canvas-shotlist",
      version: 1,
      generated_at: new Date().toISOString(),
      project: {
        id: project.id,
        title: project.title,
        format: project.format,
        client_id: project.client_id,
        content_plan_id: project.content_plan_id,
        content_item_id: project.content_item_id,
      },
      shots: scenes.flatMap((scene) =>
        shots
          .filter((s) => s.scene_id === scene.id)
          .map((shot) => {
            const pv = currentPrompt(shot);
            const img = pickImage(shot);
            return {
              scene: scene.title,
              beat: scene.beat,
              shot_id: shot.id,
              title: shot.title,
              status: shot.status,
              duration_s: shot.duration,
              camera: shot.camera,
              camera_presets: shot.camera_presets ?? [],
              light: shot.light,
              motion: shot.motion,
              souls: soulsFor(shot).map((s) => ({ key: s.key, kind: s.kind })),
              refs: shotRefs
                .filter((r) => r.shot_id === shot.id)
                .map((r) => ({ slot: r.slot, role: r.role, media_url: abs(r.media_url), note: r.note })),
              prompt_version: pv?.version ?? null,
              engine_hint: pv?.engine_hint ?? null,
              compiled_prompt: pv?.compiled ?? shot.description,
              chain: pv?.chain ?? [],
              selected_media: img ? abs(img.media_url) : null,
            };
          })
      ),
    };
    return NextResponse.json(jobfile, {
      headers: {
        "Content-Disposition": `attachment; filename="shotlist-${project.id.slice(0, 8)}.json"`,
      },
    });
  }

  // Storyboard-HTML (printbar → PDF)
  const sceneBlocks = scenes
    .map((scene) => {
      const sceneShots = shots.filter((s) => s.scene_id === scene.id);
      const cards = sceneShots
        .map((shot) => {
          const img = pickImage(shot);
          const shotSoulList = soulsFor(shot)
            .map((s) => `<span class="soul">${esc(s.name)}</span>`)
            .join("");
          const meta = [shot.camera, shot.light, shot.motion].filter(Boolean).join(" · ");
          return `<div class="shot">
  ${img ? `<img src="${esc(abs(img.media_url))}" alt="${esc(shot.title)}"/>` : `<div class="noimg">ingen bild vald</div>`}
  <div class="shotbody">
    <div class="shottitle">${esc(shot.title || "Namnlös shot")} <span class="dur">${shot.duration.toFixed(1)}s</span></div>
    ${shot.description ? `<p>${esc(shot.description)}</p>` : ""}
    ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
    ${shotSoulList ? `<p class="souls">${shotSoulList}</p>` : ""}
  </div>
</div>`;
        })
        .join("\n");
      return `<section class="scene">
  <h2>${esc(scene.title || "Namnlös scen")}${scene.beat ? ` <span class="beat">${esc(scene.beat)}</span>` : ""}</h2>
  <div class="grid">${cards || "<p class='empty'>Inga shots i scenen.</p>"}</div>
</section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8"/>
<title>Storyboard — ${esc(project.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; max-width: 1100px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 32px; }
  h1 { font-size: 28px; letter-spacing: -0.02em; }
  .sub { color: #666; font-size: 13px; }
  .scene { margin-bottom: 36px; break-inside: avoid; }
  h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
  .beat { font-weight: 400; color: #888; font-size: 13px; text-transform: none; letter-spacing: 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .shot { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; break-inside: avoid; }
  .shot img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; background: #eee; }
  .noimg { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: #f4f4f4; color: #999; font-size: 12px; }
  .shotbody { padding: 10px 12px; }
  .shottitle { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .dur { color: #888; font-weight: 400; font-size: 12px; }
  .shotbody p { font-size: 12px; color: #444; margin-top: 4px; line-height: 1.45; }
  .meta { color: #777 !important; font-style: italic; }
  .soul { display: inline-block; background: #eef; border-radius: 999px; padding: 1px 8px; font-size: 11px; margin-right: 4px; }
  .empty { color: #999; font-size: 13px; }
  .printbtn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #1a1a1a; color: #fff; border: 0; border-radius: 8px; font-size: 14px; cursor: pointer; }
  @media print { .printbtn { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<button class="printbtn" onclick="window.print()">Skriv ut / Spara som PDF</button>
<header>
  <div>
    <h1>${esc(project.title)}</h1>
    <div class="sub">Storyboard · format ${esc(project.format)} · status ${esc(project.status)}</div>
  </div>
  <div class="sub">${new Date().toISOString().slice(0, 10)} · Zaitex</div>
</header>
${sceneBlocks || "<p class='empty'>Projektet har inga scener än.</p>"}
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
