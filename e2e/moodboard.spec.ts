// MOODBOARD-BEVISET (prototyp-ytan): allt som rör design går genom canvasen.
// Skapa bräde → intag via UI (bild-URL + notis) → agent-seamen (externt verktyg
// skjuter in via cv_mood_intake, källa 'stitch') → HTML-komponent via upload
// renderas sandboxat → kurering behåll/förkasta → promotering till biblioteket
// (promoted_at läsbar i cv_moodboard_items — studios hämtyta).

import { expect, test } from "@playwright/test";

const BEVIS = "e2e-bevis";

test("moodboard-flödet: intag → komponent → kurering → promotering", async ({
  page,
  request,
}) => {
  const title = `Moodboard e2e ${Date.now()}`;
  let boardId = "";

  await test.step("1. Skapa moodboard från startsidan", async () => {
    await page.goto("/");
    await page.getByTestId("new-moodboard-title").fill(title);
    await page.getByTestId("create-moodboard").click();
    await page.waitForURL(/\/m\//);
    boardId = page.url().split("/m/")[1];
    await expect(page.getByTestId("moodboard-title")).toHaveText(title);
    // vänta in liveness-trappan (live/brygga/poll) — externa intag ska synas utan reload
    await expect(page.getByTestId("live-status")).not.toHaveText("ansluter…", {
      timeout: 20_000,
    });
  });

  await test.step("2. Intag via UI: bild-URL", async () => {
    await page
      .getByTestId("mood-intake-url")
      .fill("/api/mock/render?seed=901&engine=agent-intag&kind=image&prompt=moodboard%20e2e%20bild");
    await page.getByTestId("mood-intake-caption").fill("e2e-bild");
    await page.getByTestId("mood-intake-add").click();
    await expect(page.getByTestId("mood-card")).toHaveCount(1, { timeout: 10_000 });
  });

  await test.step("3. Intag via UI: notis", async () => {
    await page.getByTestId("mood-intake-kind").selectOption("note");
    await page.getByTestId("mood-intake-title").fill("Riktning");
    await page.getByTestId("mood-intake-caption").fill("rått + varmt, inga sterila studiomiljöer");
    await page.getByTestId("mood-intake-add").click();
    await expect(page.getByTestId("mood-card")).toHaveCount(2, { timeout: 10_000 });
  });

  await test.step("4. Agent-seamen: externt verktyg skjuter in via verbet", async () => {
    const res = await request.post("/api/verbs/cv_mood_intake", {
      data: {
        p_moodboard_id: boardId,
        p_media_url:
          "/api/mock/render?seed=902&engine=agent-intag&kind=image&prompt=stitch-kurering",
        p_kind: "image",
        p_title: "Stitch-kuration",
        p_source: "stitch",
      },
    });
    expect(res.ok()).toBeTruthy();
    // ...och landar i brädet utan reload (realtime/bryggan)
    await expect(page.getByTestId("mood-card")).toHaveCount(3, { timeout: 10_000 });
    await expect(page.getByTestId("mood-source").filter({ hasText: "stitch" })).toHaveCount(1);
  });

  await test.step("5. HTML-komponent via upload → sandboxad rendering", async () => {
    const res = await request.post("/api/upload", {
      multipart: {
        moodboard_id: boardId,
        file: {
          name: "knapp-komponent.html",
          mimeType: "text/html",
          buffer: Buffer.from(
            `<!doctype html><body style="background:#111;color:#eee;font-family:sans-serif">` +
              `<button id="cta" style="padding:10px 18px;border-radius:8px;background:#10b981;border:0;color:#fff">Zaitex CTA</button>` +
              `<script>document.getElementById('cta').textContent='Zaitex CTA (live)';</script></body>`
          ),
        },
      },
    });
    expect(res.ok()).toBeTruthy();
    await expect(page.getByTestId("mood-card")).toHaveCount(4, { timeout: 10_000 });
    // komponenten KÖRS (scriptet har skrivit om knapptexten) — sandboxad iframe
    const frame = page.frameLocator('iframe[title="knapp-komponent.html"]');
    await expect(frame.locator("#cta")).toHaveText("Zaitex CTA (live)");
    await page.screenshot({ path: `${BEVIS}/10-moodboard-komponent.png`, fullPage: true });
  });

  await test.step("6. Kurering: behåll + förkasta", async () => {
    const first = page.getByTestId("mood-card").first();
    await first.getByRole("button", { name: "Behåll", exact: true }).click();
    await expect(first.getByText("behållen")).toBeVisible();
    const noteCard = page.getByTestId("mood-card").filter({ hasText: "Riktning" });
    await noteCard.getByRole("button", { name: "Förkasta", exact: true }).click();
    await expect(noteCard.getByText("förkastad")).toBeVisible();
  });

  await test.step("7. Promotering → biblioteket (studios hämtyta ser stämpeln)", async () => {
    const first = page.getByTestId("mood-card").first();
    await first.getByRole("button", { name: "Promota", exact: true }).click();
    await expect(first.getByTestId("mood-promoted")).toHaveText("→ bibliotek");
    // Seamen studio läser: promoted_at satt i cv_moodboard_items
    const rest = await request.get(
      `/sb-local/rest/v1/cv_moodboard_items?moodboard_id=eq.${boardId}`
    );
    expect(rest.ok()).toBeTruthy();
    const rows = (await rest.json()) as { promoted_at: string | null; promoted_to: string | null }[];
    const promoted = rows.filter((r) => r.promoted_at !== null);
    expect(promoted.length).toBe(1);
    expect(promoted[0].promoted_to).toBe("bibliotek");
    await page.screenshot({ path: `${BEVIS}/11-moodboard-kurerat.png`, fullPage: true });
  });
});
