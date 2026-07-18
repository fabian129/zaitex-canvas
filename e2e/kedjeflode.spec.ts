// END-TO-END-BEVISET (FÖNSTER 3 DoD + canvasen v2 steg 2-5): kedjeflödet i
// browsern med mockar — shot → kedja → batchgrind (tak) → mock-motor →
// kurering → export, plus Realtime-intag via DB-rader, URL-pull, uppladdning,
// kamera-presets (stack), referens-slots, kostnadstak och webhook-seamen.
// Screenshots hamnar i e2e-bevis/ (gitignoreras inte — de ÄR beviset).

import { expect, test } from "@playwright/test";

const BEVIS = "e2e-bevis";
const DEMO_TITLE = "Zaitex — lanserings-storyboard (demo)";

// Klickar en shot via dess kort (titeltexten kan förekomma även i batch-panelen)
const shotCard = (page: import("@playwright/test").Page, title: string) =>
  page.locator('[data-testid^="shot-card-"]', { hasText: title });

test("kedjeflödet end-to-end med mockar", async ({ page, request }) => {
  let projectId = "";

  await test.step("1. Projektlistan → öppna demo-projektet", async () => {
    await page.goto("/");
    await page.getByText(DEMO_TITLE).click();
    await expect(page.getByTestId("project-title")).toHaveText(DEMO_TITLE);
    projectId = page.url().split("/p/")[1];
    await expect(page.getByTestId("live-status")).not.toHaveText("… kopplar", {
      timeout: 20_000,
    });
  });

  await test.step("2. Brädet: scener + shots renderar", async () => {
    await expect(page.locator('[data-testid^="scene-row-"]')).toHaveCount(3);
    await expect(page.locator('[data-testid^="shot-card-"]')).toHaveCount(5);
    await page.screenshot({ path: `${BEVIS}/01-bradet.png`, fullPage: true });
  });

  await test.step("3. Realtime-intag: DB-rad → trayn utan reload", async () => {
    await page.getByTestId("tab-intag").click();
    const trayBefore = await page.locator('[data-testid^="tray-item-"]').count();
    const liveStatus = await page.getByTestId("live-status").textContent();
    const t0 = Date.now();
    const res = await request.post("/api/intake", {
      data: {
        project_id: projectId,
        media_url:
          "/api/mock/render?seed=777001&engine=agent-intag&kind=image&prompt=realtime-bevis%3A%20agent%20l%C3%A4gger%20DB-rad",
        prompt: "realtime-bevis: inlagd via HTTP-intag under pågående session",
      },
    });
    expect(res.ok()).toBeTruthy();
    await expect(page.locator('[data-testid^="tray-item-"]')).toHaveCount(trayBefore + 1, {
      timeout: 10_000,
    });
    console.log(
      `REALTIME-INTAG: ${Date.now() - t0} ms till UI, kanal-status: ${liveStatus?.trim()}`
    );
    await page.screenshot({ path: `${BEVIS}/02-realtime-intag.png`, fullPage: true });
  });

  await test.step("4. URL-pull → storage → trayn", async () => {
    const trayBefore = await page.locator('[data-testid^="tray-item-"]').count();
    const res = await request.post("/api/intake", {
      data: {
        project_id: projectId,
        pull_url:
          "http://localhost:3000/api/mock/render?seed=777002&engine=url-pull&kind=image&prompt=url-pull-bevis",
      },
    });
    expect(res.ok()).toBeTruthy();
    await expect(page.locator('[data-testid^="tray-item-"]')).toHaveCount(trayBefore + 1, {
      timeout: 10_000,
    });
    const urls = await page
      .locator('[data-testid^="tray-item-"] img')
      .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
    // prod: supabase storage-URL; lokal-läget: /uploads/ (filsystem bakom storeMedia-seamen)
    expect(
      urls.some((u) => u.includes("supabase.co/storage") || u.includes("/uploads/"))
    ).toBeTruthy();
  });

  await test.step("5. Uppladdning → storage → trayn", async () => {
    const trayBefore = await page.locator('[data-testid^="tray-item-"]').count();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#0a6"/><text x="20" y="95" fill="#fff" font-size="20">uppladdnings-bevis</text></svg>`;
    const res = await request.post("/api/upload", {
      multipart: {
        file: { name: "bevis.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) },
        project_id: projectId,
      },
    });
    expect(res.ok()).toBeTruthy();
    await expect(page.locator('[data-testid^="tray-item-"]')).toHaveCount(trayBefore + 1, {
      timeout: 10_000,
    });
  });

  await test.step("6. Shot + souls + kedja: bygg och versionera prompten", async () => {
    await shotCard(page, "Grundaren kliver in").click();
    await expect(page.getByTestId("shot-panel")).toBeVisible();
    // souls-kopplingen bevisas nedan via SOUL-fragmenten i den kompilerade prompten
    await expect(page.getByTestId("shot-panel").getByText("Souls på shoten")).toBeVisible();

    const ops = [
      { op: "rekontextualisera", params: "in i fabriken, gryning, Soul: fabriken styr miljön" },
      { op: "restyle", params: "kodak portra-palett, mjuk filmisk grain" },
      { op: "relight", params: "varmt sidoljus från takfönstren, djupa skuggor" },
    ];
    for (let i = 0; i < ops.length; i++) {
      await page.getByTestId("add-chain-step").click();
      const stepBox = page.getByTestId("prompt-panel").locator(".rounded-lg.border").nth(i);
      await stepBox.locator("select").selectOption(ops[i].op);
      await stepBox.locator("input").fill(ops[i].params);
    }
    await page.getByTestId("engine-hint-select").selectOption("mock-nano-banana");

    // KAMERA-PRESETS (v2 steg 2): stacka 2 ur vokabulären (olika kategorier).
    // Taket max 3 är DB-mekanik (cv_shot_set_presets + check-constraint).
    for (const id of ["dolly-in", "low-angle"]) {
      if ((await page.getByTestId(`preset-chip-${id}`).count()) === 0) {
        await page.getByTestId("preset-select").selectOption(id);
      }
      await expect(page.getByTestId(`preset-chip-${id}`)).toBeVisible({ timeout: 10_000 });
    }

    // REFERENS-SLOTS (v2 steg 3): sätt slot 1 ur trayn med rollen "stil".
    if ((await page.getByTestId("ref-clear-1").count()) === 0) {
      await page.getByTestId("ref-src-1").selectOption({ index: 1 });
      await page.getByTestId("ref-role-1").selectOption("stil");
      await page.getByTestId("ref-set-1").click();
    }
    await expect(page.getByTestId("ref-clear-1")).toBeVisible({ timeout: 10_000 });

    const compiled = await page.getByTestId("compiled-prompt").textContent();
    expect(compiled).toContain("SOUL[character:grundaren]");
    expect(compiled).toContain("SOUL[place:fabriken]");
    expect(compiled).toContain("REF[1:stil]");
    expect(compiled).toContain("KAMERA-PRESET[1/2]: Dolly in");
    expect(compiled).toContain("KAMERA-PRESET[2/2]: Low angle");
    expect(compiled).toContain("KEDJA:");
    expect(compiled).toContain("nano-banana edit-chain v0 — OBEVISAD");

    await page.getByTestId("save-prompt").click();
    await expect(page.getByTestId("prompt-version-select")).toBeVisible();
    await expect(page.getByTestId("prompt-version-select")).toContainText("v1");
    await page.screenshot({ path: `${BEVIS}/03-promptkedjan.png`, fullPage: true });
  });

  await test.step("7. Batchgrinden: 3 jobb, tak 2 → godkänn → mock-motorn kör", async () => {
    await page.getByTestId("batch-mode-toggle").click();
    for (const title of ["Öppning: maskinhallen", "Grundaren kliver in", "Produkten i drift"]) {
      await shotCard(page, title).click();
    }
    await page.getByTestId("batch-cap-input").fill("2");
    await page.getByTestId("batch-engine-select").selectOption("mock-nano-banana");
    await page.getByTestId("create-batch").click();

    await expect(page.getByTestId("batch-panel")).toBeVisible();
    // batcherna listas nyast först — allt nedan scopas till den nyskapade
    const batchBox = page.locator('[data-testid^="batch-box-"]').first();
    await expect(batchBox.getByText("väntar på godkännande")).toBeVisible();
    await page.screenshot({ path: `${BEVIS}/04-batchgrinden-stangd.png`, fullPage: true });

    await batchBox.locator('[data-testid^="approve-batch-"]').click();
    // mock-motorn (adapter-kön) processar; liveness-lagret driver statusarna in i UI:t
    await expect(batchBox.getByText("klar", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(batchBox.getByText("skippad")).toHaveCount(1, { timeout: 30_000 });
    await expect(batchBox.getByText("över taket (cap_max_jobs)")).toBeVisible();
    await page.screenshot({ path: `${BEVIS}/05-batch-kord-med-tak.png`, fullPage: true });
  });

  await test.step("7b. Kostnadstaket (v2 steg 4): 3 jobb à 4 ku, budget 8 → 1 skippas på kostnad", async () => {
    await page.getByTestId("batch-mode-toggle").click();
    for (const title of ["Öppning: maskinhallen", "Resultatet", "Logotyp-avslut"]) {
      await shotCard(page, title).click();
    }
    await page.getByTestId("batch-engine-select").selectOption("mock-higgsfield");
    await page.getByTestId("batch-cap-input").fill("10");
    await page.getByTestId("batch-budget-input").fill("8");
    await page.getByTestId("create-batch").click();

    await expect(page.getByTestId("batch-panel")).toBeVisible();
    const batchBox = page.locator('[data-testid^="batch-box-"]').first();
    await expect(batchBox.getByText("väntar på godkännande")).toBeVisible();
    await expect(batchBox.getByText("budget 8 ku")).toBeVisible();

    await batchBox.locator('[data-testid^="approve-batch-"]').click();
    // Grinden är DB-mekanik: kumulativ kostnad 4, 8, 12 — tredje jobbet över budgeten.
    await expect(batchBox.getByText("över taket (cap_max_cost)")).toBeVisible({ timeout: 15_000 });
    await expect(batchBox.getByText("skippad")).toHaveCount(1, { timeout: 15_000 });
    await expect(batchBox.getByText("klar", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: `${BEVIS}/09-kostnadstak.png`, fullPage: true });
  });

  await test.step("7c. Webhook-seamen (v2 steg 5): async-motor → dispatched → callback → klar", async () => {
    await page.getByTestId("batch-mode-toggle").click();
    await shotCard(page, "Produkten i drift").click();
    await page.getByTestId("batch-engine-select").selectOption("mock-higgsfield-async");
    await page.getByTestId("batch-cap-input").fill("5");
    await page.getByTestId("batch-budget-input").fill("");
    await page.getByTestId("create-batch").click();

    const batchBox = page.locator('[data-testid^="batch-box-"]').first();
    await expect(batchBox.getByText("väntar på godkännande")).toBeVisible();
    await batchBox.locator('[data-testid^="approve-batch-"]').click();

    // Server-sidan (REST, oberoende av UI-debounce): jobbet ska PASSERA 'dispatched'
    // och stängas av motorns callback — inte av runnern.
    const bRes = await request.get(
      `/sb-local/rest/v1/cv_batches?project_id=eq.${projectId}&order=created_at.desc&limit=1`
    );
    const batchId = (await bRes.json())[0].id as string;
    let sawDispatched = false;
    let item: { id: string; status: string; external_job_id: string | null } | null = null;
    for (let i = 0; i < 60; i++) {
      const res = await request.get(`/sb-local/rest/v1/cv_batch_items?batch_id=eq.${batchId}`);
      item = (await res.json())[0];
      if (item?.status === "dispatched") {
        sawDispatched = true;
        await page.screenshot({ path: `${BEVIS}/10-webhook-dispatched.png`, fullPage: true });
      }
      if (item?.status === "succeeded" || item?.status === "failed") break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(sawDispatched).toBeTruthy();
    expect(item?.status).toBe("succeeded");
    expect(item?.external_job_id).toContain("mock-async-");

    // Callback-mottagaren avvisar fel token (403) — och dubbletter på avslutade
    // jobb är no-op i DB (idempotensen ligger i cv_job_callback).
    const bad = await request.post("/api/engine-callback", {
      data: { item_id: item!.id, token: "fel-token", status: "succeeded", media_url: "x" },
    });
    expect(bad.status()).toBe(403);

    await expect(batchBox.getByText("klar", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: `${BEVIS}/11-webhook-klar.png`, fullPage: true });
  });

  await test.step("8. Kurering: variant-stacken A/B — välj, förkasta, kommentera", async () => {
    await shotCard(page, "Grundaren kliver in").click();
    await expect(page.getByTestId("variant-stack")).toBeVisible();
    const variants = page.locator('[data-testid^="variant-"]:not([data-testid="variant-stack"])');
    await expect(variants.first()).toBeVisible();

    await variants.first().getByText("Välj", { exact: true }).click();
    await expect(page.getByText("vald", { exact: true })).toBeVisible();
    const count = await variants.count();
    if (count > 1) {
      await variants.nth(1).getByText("Förkasta").click();
      await expect(page.getByText("förkastad").first()).toBeVisible();
    }
    await variants.first().locator("input[placeholder^='Kommentar']").fill("stark riktning — kör denna som master");
    await variants.first().locator("input[placeholder^='Kommentar']").blur();
    await page.screenshot({ path: `${BEVIS}/06-kurering.png`, fullPage: true });
  });

  await test.step("9. Export: storyboard-HTML + shotlista (jobbfil)", async () => {
    const sbPage = await page.context().newPage();
    await sbPage.goto(`/api/export/${projectId}`);
    await expect(sbPage.locator("h1")).toHaveText(DEMO_TITLE);
    expect(await sbPage.locator(".shot img").count()).toBeGreaterThan(0);
    await sbPage.screenshot({ path: `${BEVIS}/07-export-storyboard.png`, fullPage: true });
    await sbPage.close();

    const res = await request.get(`/api/export/${projectId}?format=shotlist`);
    expect(res.ok()).toBeTruthy();
    const jobfile = await res.json();
    expect(jobfile.kind).toBe("zaitex-canvas-shotlist");
    expect(jobfile.shots).toHaveLength(5);
    const grundaren = jobfile.shots.find((s: { title: string }) => s.title === "Grundaren kliver in");
    expect(grundaren.prompt_version).toBeGreaterThanOrEqual(1);
    expect(grundaren.compiled_prompt).toContain("KEDJA:");
    expect(grundaren.souls.map((s: { key: string }) => s.key).sort()).toEqual([
      "fabriken",
      "grundaren",
    ]);
    // v2: presets + typade referenser följer med i jobbfilen
    expect(grundaren.camera_presets).toEqual(["dolly-in", "low-angle"]);
    expect(grundaren.refs.length).toBeGreaterThanOrEqual(1);
    expect(grundaren.refs[0].role).toBe("stil");

    // Kö-payload-beviset (v2 steg 3): cv_job_claim bar refs + presets hela vägen
    // till adaptern — mock-motorn stämplar dem i variantens meta.
    const vRes = await request.get(
      `/sb-local/rest/v1/cv_variants?shot_id=eq.${grundaren.shot_id}&order=created_at.desc`
    );
    const engineVariant = ((await vRes.json()) as {
      engine: string | null;
      meta: { refs?: number; camera_presets?: string[] };
    }[]).find((v) => v.engine === "mock-nano-banana");
    expect(engineVariant).toBeTruthy();
    expect(engineVariant!.meta.refs).toBeGreaterThanOrEqual(1);
    expect(engineVariant!.meta.camera_presets).toContain("dolly-in");
  });

  await test.step("10. Drag-omordning: byt ordning på två shots i samma scen", async () => {
    const scene2 = page.locator('[data-testid^="scene-row-"]').nth(1);
    const cards = scene2.locator('[data-testid^="shot-card-"]');
    const before = await cards.allTextContents();
    const src = cards.nth(1);
    const dst = cards.nth(0);
    const srcBox = (await src.boundingBox())!;
    const dstBox = (await dst.boundingBox())!;
    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(srcBox.x + srcBox.width / 2 + 15, srcBox.y + srcBox.height / 2, { steps: 3 });
    await page.mouse.move(dstBox.x + 20, dstBox.y + dstBox.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(async () => {
      const after = await scene2.locator('[data-testid^="shot-card-"]').allTextContents();
      expect(after[0]).toBe(before[1]);
    }).toPass({ timeout: 10_000 });
    await page.screenshot({ path: `${BEVIS}/08-drag-omordning.png`, fullPage: true });
  });
});
