// PROMPT-HJÄRNAN — kedjekompilatorn.
// Kompilerar recept (shot) + Soul ID:s + kamera/ljus/rörelse + operations-kedjan
// till en motorfärdig prompt, och lintar kedjan mot kedjereglerna.
// STATUS: OBEVISAD (skelett) — formerna bevisas via bevis-loopen när motor kopplas.

import { ChainStep, Shot, Soul } from "@/lib/types";
import { OPERATION_MAP, PHASE_ORDER } from "./operations";
import { renderDialect } from "./dialects";

export interface ChainWarning {
  stepIndex: number | null;
  rule: string;
  message: string;
}

export interface CompiledChain {
  compiled: string;
  warnings: ChainWarning[];
}

// Kedjereglerna (ur planen): struktur före stil · relight sist ·
// re-grounda mot original var N:e steg · drift-checkpoint mot Soul ID.
export const REGROUND_INTERVAL = 3;

export function lintChain(chain: ChainStep[], souls: Soul[]): ChainWarning[] {
  const warnings: ChainWarning[] = [];
  let maxPhaseSeen = -1;

  chain.forEach((step, i) => {
    const op = OPERATION_MAP[step.op];
    if (!op) {
      warnings.push({ stepIndex: i, rule: "okänd-operation", message: `Okänd operation: ${step.op}` });
      return;
    }
    const phaseIdx = PHASE_ORDER.indexOf(op.phase);
    // struktur före stil: en strukturoperation efter en stiloperation är drift-risk
    if (phaseIdx < maxPhaseSeen && op.phase === "struktur") {
      warnings.push({
        stepIndex: i,
        rule: "struktur-före-stil",
        message: `"${op.label}" (struktur) ligger efter stil/ljus-steg — strukturändringar sist i kedjan river stilen.`,
      });
    }
    maxPhaseSeen = Math.max(maxPhaseSeen, phaseIdx);
    // relight sist
    if (op.id === "relight" && i < chain.length - 1) {
      const after = chain.slice(i + 1).filter((s) => OPERATION_MAP[s.op] && s.op !== "forfina");
      if (after.length > 0) {
        warnings.push({
          stepIndex: i,
          rule: "relight-sist",
          message: "Relight ligger inte sist (endast Förfina får komma efter).",
        });
      }
    }
  });

  // re-grounda var N:e steg
  if (chain.length >= REGROUND_INTERVAL + 1) {
    warnings.push({
      stepIndex: null,
      rule: "re-ground",
      message: `Kedjan har ${chain.length} steg — re-grounda mot originalet var ${REGROUND_INTERVAL}:e steg (drift ackumulerar).`,
    });
  }
  // drift-checkpoint mot Soul ID
  if (souls.length > 0 && chain.length >= 2) {
    warnings.push({
      stepIndex: null,
      rule: "soul-checkpoint",
      message: `Kör drift-checkpoint mot Soul ID (${souls.map((s) => s.key).join(", ")}) efter sista steget innan kurering.`,
    });
  }
  return warnings;
}

export function compileChain(
  shot: Shot,
  souls: Soul[],
  chain: ChainStep[],
  engineHint: string | null
): CompiledChain {
  const warnings = lintChain(chain, souls);

  const sections: string[] = [];

  if (shot.description.trim()) {
    sections.push(`RECEPT: ${shot.description.trim()}`);
  }
  for (const soul of souls) {
    const neg = soul.negative_fragment.trim();
    sections.push(
      `SOUL[${soul.kind}:${soul.key}]: ${soul.prompt_fragment.trim()}${neg ? ` | UNDVIK: ${neg}` : ""}`
    );
  }
  const cinema = [
    shot.camera.trim() && `KAMERA: ${shot.camera.trim()}`,
    shot.light.trim() && `LJUS: ${shot.light.trim()}`,
    shot.motion.trim() && `RÖRELSE: ${shot.motion.trim()}`,
  ].filter(Boolean) as string[];
  sections.push(...cinema);

  if (chain.length > 0) {
    const steps = chain
      .map((step, i) => {
        const op = OPERATION_MAP[step.op];
        const label = op ? op.label.toUpperCase() : step.op.toUpperCase();
        return `${i + 1}. ${label}: ${step.params.trim()}`;
      })
      .join("\n");
    sections.push(`KEDJA:\n${steps}`);
  }

  const core = sections.join("\n");
  return { compiled: renderDialect(core, engineHint), warnings };
}
