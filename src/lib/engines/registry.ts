// Motor-registret. Att koppla en riktig motor = lägg till en rad här.
// Se docs/ADAPTER_SEAM.md ("Att skruva i en riktig motor").

import { EngineAdapter } from "./adapter";
import { mockHiggsfield, mockHiggsfieldAsync, mockNanoBanana } from "./mock";

const ADAPTERS: Record<string, EngineAdapter> = {
  [mockNanoBanana.name]: mockNanoBanana,
  [mockHiggsfield.name]: mockHiggsfield,
  [mockHiggsfieldAsync.name]: mockHiggsfieldAsync,
  // "fal": falAdapter,                  // SENARE: första riktiga adaptern (API-nyckel via env)
  // "nano-banana": nanoBananaAdapter,   // SENARE: riktig adapter (API-nyckel via env)
  // "higgsfield": higgsfieldAdapter,    // SENARE: riktig adapter (API eller MCP)
};

export function getAdapter(engine: string): EngineAdapter | null {
  return ADAPTERS[engine] ?? null;
}

export function listEngines(): { name: string; kind: string }[] {
  return Object.values(ADAPTERS).map((a) => ({ name: a.name, kind: a.kind }));
}
