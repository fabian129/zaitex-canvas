// PROMPT-HJÄRNAN — operations-vokabulären.
// STATUS: OBEVISAD (skelett). Vokabulären är konceptuellt låst men promptformerna
// bevisas först när riktiga motorer (Nano Banana / Higgsfield) kopplas via adapter-seamen.
// Kanonisk källa: skill-draft "canvas-operations-vokabular" i smedjan.skill_registry (lifecycle=draft).

export type OpPhase = "grund" | "struktur" | "stil" | "ljus" | "finish";

export interface Operation {
  id: string;
  label: string;
  phase: OpPhase;
  description: string;
  paramsHint: string;
}

// Ordningen här är den pedagogiska ordningen, inte kedjeordningen —
// kedjereglerna (chainRules i compile.ts) styr vad som får ligga var.
export const OPERATIONS: Operation[] = [
  {
    id: "extrahera",
    label: "Extrahera",
    phase: "grund",
    description: "Lyft ut ett element (person, objekt, yta) ur källbilden som eget arbetslager.",
    paramsHint: "vad som ska extraheras, t.ex. 'personen i förgrunden, behåll kantskärpa'",
  },
  {
    id: "overfor",
    label: "Överför",
    phase: "struktur",
    description: "Flytta ett extraherat/refererat element in i målbilden med bevarad identitet.",
    paramsHint: "vad som förs över + vart, t.ex. 'Soul: grundaren → vid maskinen, halvfigur'",
  },
  {
    id: "rekontextualisera",
    label: "Rekontextualisera",
    phase: "struktur",
    description: "Byt miljö/sammanhang runt subjektet utan att röra subjektets identitet.",
    paramsHint: "ny miljö, t.ex. 'industrilokal i gryningsljus, Soul: fabriken'",
  },
  {
    id: "rekomponera",
    label: "Rekomponera",
    phase: "struktur",
    description: "Ändra komposition: beskärning, kameravinkel, placering av element.",
    paramsHint: "ny komposition, t.ex. 'low angle, subjektet i vänster tredjedel'",
  },
  {
    id: "kombinera",
    label: "Kombinera",
    phase: "struktur",
    description: "Slå ihop element från flera källor/varianter till en bild.",
    paramsHint: "vilka källor + vad från varje, t.ex. 'bakgrund från B, subjekt från A'",
  },
  {
    id: "restyle",
    label: "Restyle",
    phase: "stil",
    description: "Byt visuell stil/material/grade utan att ändra struktur eller komposition.",
    paramsHint: "målstil, t.ex. 'kodak portra-palett, mjuk filmisk grain'",
  },
  {
    id: "relight",
    label: "Relight",
    phase: "ljus",
    description: "Ljussätt om scenen. Ligger SIST i kedjan (efter struktur + stil).",
    paramsHint: "ljussättning, t.ex. 'varmt sidoljus från fönster, djupa skuggor'",
  },
  {
    id: "forfina",
    label: "Förfina",
    phase: "finish",
    description: "Sista detaljpass: skärpa, artefakter, händer/ansikten, text i bild.",
    paramsHint: "vad som ska förfinas, t.ex. 'händerna, logotypens kanter'",
  },
];

export const OPERATION_MAP: Record<string, Operation> = Object.fromEntries(
  OPERATIONS.map((op) => [op.id, op])
);

// Fasordningen som kedjereglerna lintar mot: struktur före stil, relight sist.
export const PHASE_ORDER: OpPhase[] = ["grund", "struktur", "stil", "ljus", "finish"];
