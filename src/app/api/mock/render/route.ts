import { NextRequest, NextResponse } from "next/server";

// Mock-motorns "render": deterministisk SVG ur seed + engine + promptutdrag.
// Gör mock-resultaten synligt olika per prompt/kedja så kureringen går att öva på riktigt.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const seed = parseInt(sp.get("seed") ?? "1", 10) || 1;
  const engine = sp.get("engine") ?? "mock";
  const kind = sp.get("kind") ?? "image";
  const prompt = (sp.get("prompt") ?? "").slice(0, 220);

  const rnd = mulberry32(seed);
  const hue1 = Math.floor(rnd() * 360);
  const hue2 = (hue1 + 40 + Math.floor(rnd() * 120)) % 360;
  const shapes: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cx = Math.floor(rnd() * 960);
    const cy = Math.floor(rnd() * 540);
    const r = 40 + Math.floor(rnd() * 160);
    const hue = (hue1 + Math.floor(rnd() * 80)) % 360;
    shapes.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue} 60% ${30 + Math.floor(rnd() * 40)}%)" opacity="0.35"/>`
    );
  }
  const promptLines: string[] = [];
  const words = prompt.split(/\s+/).filter(Boolean);
  let line = "";
  for (const w of words) {
    if ((line + " " + w).length > 52) {
      promptLines.push(line);
      line = w;
      if (promptLines.length >= 4) break;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line && promptLines.length < 4) promptLines.push(line);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue1} 45% 18%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 55% 32%)"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  ${shapes.join("\n  ")}
  <rect x="0" y="0" width="960" height="540" fill="none" stroke="hsl(${hue2} 70% 60%)" stroke-width="4"/>
  <text x="32" y="52" font-family="monospace" font-size="26" fill="white" opacity="0.95">${esc(engine)} · ${esc(kind)} · seed ${seed}</text>
  <text x="32" y="86" font-family="monospace" font-size="18" fill="white" opacity="0.7">MOCK-RENDER — riktig motor kopplas via adapter-seamen</text>
  ${promptLines
    .map(
      (l, i) =>
        `<text x="32" y="${470 + i * 22 - (promptLines.length - 1) * 22}" font-family="monospace" font-size="16" fill="white" opacity="0.8">${esc(l)}</text>`
    )
    .join("\n  ")}
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
