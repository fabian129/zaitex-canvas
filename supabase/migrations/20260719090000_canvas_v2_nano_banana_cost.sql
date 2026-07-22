-- Första riktiga motorn: nano-banana (Googles Gemini-bildmodeller via GEMINI_API_KEY).
-- Kostnadsenheten hålls i samma klass som mocken (1 ku ≈ en billig bild, ~4 öre).
insert into canvas.engine_costs (engine, cost_units, note) values
  ('nano-banana', 1, 'Googles Gemini-bildmodeller (gemini-2.5-flash-image m.fl.) — riktig adapter')
on conflict (engine) do nothing;
