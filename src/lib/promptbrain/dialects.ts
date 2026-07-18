// PROMPT-HJÄRNAN — per-motor-dialekternas FORMAT.
// STATUS: OBEVISAD. Dessa format är hypoteser om hur respektive motor vill ha
// kedjan serverad. De bevisas/justeras via bevis-loopen först när riktiga
// adapters kopplas (Nano Banana API, Higgsfield MCP). Mock-adaptrarna kör
// formaten rakt igenom så att seamen är exerciserad redan nu.

const DIALECTS: Record<string, (core: string) => string> = {
  // Nano Banana (bildredigering): instruktionsblock, en operation i taget,
  // explicit "behåll allt annat" — hypotes: modellen driftar mindre med
  // bevarande-klausul per steg.
  "nano-banana": (core) =>
    [
      "[FORMAT: nano-banana edit-chain v0 — OBEVISAD]",
      core,
      "REGEL: utför stegen i ordning; bevara allt som inte uttryckligen ändras i varje steg.",
    ].join("\n"),

  // Higgsfield (cinematisk video): blockformat med scene/camera/motion-sektioner —
  // hypotes: motorn prioriterar kamera- och rörelsebeskrivning över adjektivtäthet.
  higgsfield: (core) =>
    [
      "[FORMAT: higgsfield cinematic block v0 — OBEVISAD]",
      core,
      "REGEL: kamera och rörelse är styrande; stil får aldrig motsäga KAMERA/LJUS-raderna.",
    ].join("\n"),
};

export function renderDialect(core: string, engineHint: string | null): string {
  if (!engineHint) return core;
  const key = engineHint.replace(/^mock-/, "");
  const render = DIALECTS[key];
  return render ? render(core) : core;
}

export const DIALECT_KEYS = Object.keys(DIALECTS);
