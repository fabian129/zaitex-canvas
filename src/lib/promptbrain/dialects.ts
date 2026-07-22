// PROMPT-HJÄRNAN — per-motor-dialekternas FORMAT.
// STATUS: nano-banana v0.1 — SEKUNDÄRBEVISAD (Googles officiella promptguider) med ett
// primärbevis (IMAGE-modalitet, ligger i adaptern); higgsfield v0 — OBEVISAD.
// Full bevisning per dialekt via bevis-loopen (skill canvas-bevisloopen).
// Kanonisk källa: skill-draft "canvas-motor-dialekter"; recepten: "canvas-fotorealism".

const DIALECTS: Record<string, (core: string) => string> = {
  // Nano Banana (bildredigering) v0.1 — ur officiella guiderna:
  // narrativ läsning (sektionerna är EN scen, inte nyckelord), refs-före-text
  // ([refs]+[relation]+[scenario] — adaptern skickar bilderna före prompten),
  // positiv inramning, bevarande-klausul per steg.
  "nano-banana": (core) =>
    [
      "[FORMAT: nano-banana edit-chain v0.1 — sekundärbevisad]",
      "Läs sektionerna nedan som EN sammanhängande scen (RECEPT = subjekt+handling+plats; " +
        "REF[n] beskriver de bifogade referensbilderna i ordning; KAMERA/LJUS = fotografisk " +
        "styrning; KEDJA = redigeringssteg som utförs i ordning).",
      core,
      "REGEL: utför kedjestegen ett i taget, i ordning; bevara allt som inte uttryckligen " +
        "ändras i varje steg. Beskriv önskat tillstånd positivt. Bevara identiteten i " +
        "SOUL-raderna och referensbilderna exakt.",
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
