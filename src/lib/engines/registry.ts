// Motor-registret. Att koppla en riktig motor = lägg till en rad här.
// Se docs/ADAPTER_SEAM.md ("Att skruva i en riktig motor").

import { EngineAdapter } from "./adapter";
import { mockHiggsfield, mockHiggsfieldAsync, mockNanoBanana } from "./mock";
import { nanoBanana } from "./nano-banana";

const ADAPTERS: Record<string, EngineAdapter> = {
  [mockNanoBanana.name]: mockNanoBanana,
  [mockHiggsfield.name]: mockHiggsfield,
  [mockHiggsfieldAsync.name]: mockHiggsfieldAsync,
  [nanoBanana.name]: nanoBanana, // RIKTIG: Googles Gemini-bildmodeller (GEMINI_API_KEY)
  // "veo": veoAdapter,                  // SENARE: video via samma Google-nyckel
  // "higgsfield": higgsfieldAdapter,    // SENARE: Soul-träning + presets (API eller MCP)
};

export function getAdapter(engine: string): EngineAdapter | null {
  return ADAPTERS[engine] ?? null;
}

export function listEngines(): { name: string; kind: string }[] {
  return Object.values(ADAPTERS).map((a) => ({ name: a.name, kind: a.kind }));
}
