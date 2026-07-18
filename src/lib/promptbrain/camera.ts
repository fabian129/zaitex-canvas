// PROMPT-HJÄRNAN — kamera-preset-vokabulären (Higgsfield-mönstret: namngivna,
// stackbara presets i stället för fritt formulerad kameraprosa).
// STATUS: OBEVISAD (skelett). Fragmenten är hypoteser tills bevis-loopen körts
// mot riktig motor. Startkanon: destillat av Higgsfields ~50 presets + klassisk
// filmgrammatik. DB lagrar bara preset-id:n (canvas.shots.camera_presets);
// taket max 3 verkställs i DB (cv_shot_set_presets + check-constraint).

export type PresetCategory = "rörelse" | "vinkel" | "lins" | "ram";

export interface CameraPreset {
  id: string;
  label: string;
  category: PresetCategory;
  // Fragmentet som kompileras in i prompten (motorspråk: engelska filmtermer).
  fragment: string;
  description: string;
}

export const MAX_CAMERA_PRESETS = 3;

export const CAMERA_PRESETS: CameraPreset[] = [
  // — RÖRELSE (hur kameran förflyttar sig) —
  { id: "dolly-in", label: "Dolly in", category: "rörelse", fragment: "slow dolly in, gradual approach toward subject", description: "Långsam åkning mot subjektet — intimitet, fokus." },
  { id: "dolly-out", label: "Dolly out", category: "rörelse", fragment: "slow dolly out, revealing the surrounding space", description: "Åkning bakåt — avslöjar miljön, släpper subjektet." },
  { id: "tracking", label: "Tracking", category: "rörelse", fragment: "lateral tracking shot, camera moves parallel with subject", description: "Kameran följer subjektet i sidled." },
  { id: "crane-up", label: "Crane up", category: "rörelse", fragment: "crane shot rising upward, expanding overview", description: "Kranlyft uppåt — från detalj till överblick." },
  { id: "crash-zoom", label: "Crash zoom", category: "rörelse", fragment: "rapid crash zoom toward subject, abrupt and energetic", description: "Snabb aggressiv zoom — energi, chockverkan." },
  { id: "whip-pan", label: "Whip pan", category: "rörelse", fragment: "whip pan, fast horizontal blur transition", description: "Piskande panorering — övergång, tempo." },
  { id: "orbit", label: "Orbit", category: "rörelse", fragment: "orbital camera move circling the subject", description: "Kameran cirklar runt subjektet." },
  { id: "handheld", label: "Handhållen", category: "rörelse", fragment: "handheld camera, subtle organic shake, documentary energy", description: "Handhållen — dokumentär nerv, närvaro." },
  { id: "static", label: "Statisk", category: "rörelse", fragment: "locked-off static camera, perfectly still frame", description: "Låst kamera — lugn, komposition får tala." },
  // — VINKEL (varifrån kameran ser) —
  { id: "low-angle", label: "Low angle", category: "vinkel", fragment: "low angle shot looking up, subject appears powerful", description: "Underifrån — makt, monumentalitet." },
  { id: "high-angle", label: "High angle", category: "vinkel", fragment: "high angle looking down at subject", description: "Ovanifrån — utsatthet, överblick." },
  { id: "overhead", label: "Overhead", category: "vinkel", fragment: "top-down overhead shot, graphic composition", description: "Rakt uppifrån — grafisk, kartlik komposition." },
  { id: "eye-level", label: "Ögonhöjd", category: "vinkel", fragment: "eye-level camera, neutral human perspective", description: "I ögonhöjd — neutralt, mänskligt." },
  { id: "dutch", label: "Dutch angle", category: "vinkel", fragment: "dutch angle, tilted horizon, unease", description: "Lutat horisontalplan — obehag, instabilitet." },
  { id: "pov", label: "POV", category: "vinkel", fragment: "first-person point of view shot", description: "Subjektets egna ögon — inlevelse." },
  // — LINS (optikens karaktär) —
  { id: "macro", label: "Macro", category: "lins", fragment: "extreme macro lens, shallow focus on fine detail", description: "Extrem närbild — materialkänsla, precision." },
  { id: "wide-24", label: "Vidvinkel 24mm", category: "lins", fragment: "24mm wide angle lens, expansive perspective with mild distortion", description: "Vid känsla, drar in miljön." },
  { id: "tele-135", label: "Tele 135mm", category: "lins", fragment: "135mm telephoto lens, compressed perspective, creamy background separation", description: "Komprimerat djup — subjektet lyfts ur bakgrunden." },
  { id: "anamorphic", label: "Anamorfisk", category: "lins", fragment: "anamorphic lens, oval bokeh, horizontal flares, cinematic width", description: "Filmisk bredd, ovala bokeh, flares." },
  { id: "fisheye", label: "Fisheye", category: "lins", fragment: "fisheye lens, extreme curved distortion", description: "Extrem distorsion — lekfullt, rått." },
  // — RAM (utsnittet) —
  { id: "extreme-wide", label: "Extreme wide", category: "ram", fragment: "extreme wide establishing shot, subject small in vast space", description: "Etablerande vidbild — subjektet litet i rummet." },
  { id: "medium", label: "Medium", category: "ram", fragment: "medium shot, waist up framing", description: "Halvfigur — samtal, handling." },
  { id: "close-up", label: "Close-up", category: "ram", fragment: "tight close-up framing on face", description: "Närbild — känsla, reaktion." },
  { id: "over-shoulder", label: "Over shoulder", category: "ram", fragment: "over-the-shoulder framing, foreground shoulder anchors depth", description: "Över axeln — relation, riktning." },
];

export const CAMERA_PRESET_MAP: Record<string, CameraPreset> = Object.fromEntries(
  CAMERA_PRESETS.map((p) => [p.id, p])
);

export const PRESET_CATEGORIES: PresetCategory[] = ["rörelse", "vinkel", "lins", "ram"];

export interface PresetWarning {
  rule: string;
  message: string;
}

// Stackningsregler: max 3 totalt (DB-mekanik), och mer än en preset ur samma
// kategori är krockrisk (två rörelser/vinklar kan motsäga varandra) — varning, inte stopp.
export function lintPresets(presetIds: string[]): PresetWarning[] {
  const warnings: PresetWarning[] = [];
  const unknown = presetIds.filter((id) => !CAMERA_PRESET_MAP[id]);
  for (const id of unknown) {
    warnings.push({ rule: "okänd-preset", message: `Okänd kamera-preset: ${id}` });
  }
  if (presetIds.length > MAX_CAMERA_PRESETS) {
    warnings.push({
      rule: "preset-stack",
      message: `${presetIds.length} presets — taket är ${MAX_CAMERA_PRESETS} (DB:t vägrar spara fler).`,
    });
  }
  const byCategory = new Map<PresetCategory, string[]>();
  for (const id of presetIds) {
    const p = CAMERA_PRESET_MAP[id];
    if (!p) continue;
    byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p.label]);
  }
  for (const [cat, labels] of byCategory) {
    if (labels.length > 1) {
      warnings.push({
        rule: "preset-krock",
        message: `Två ${cat}-presets i stacken (${labels.join(" + ")}) — risk att de motsäger varandra.`,
      });
    }
  }
  return warnings;
}
