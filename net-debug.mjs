import { chromium } from "@playwright/test";

const proxy = process.env.HTTPS_PROXY;
console.log("proxy:", proxy);
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  proxy: proxy ? { server: proxy, bypass: "localhost,127.0.0.1" } : undefined,
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on("console", (m) => console.log("CONSOLE:", m.type(), m.text().slice(0, 300)));
page.on("requestfailed", (r) => console.log("FAILED:", r.url().slice(0, 120), r.failure()?.errorText));
page.on("response", (r) => {
  if (!r.url().includes("localhost")) console.log("RESP:", r.status(), r.url().slice(0, 120));
});
await page.goto("http://localhost:3000/");
await page.waitForTimeout(8000);
const body = await page.textContent("body");
console.log("BODY HAS DEMO:", body?.includes("lanserings-storyboard"));
await browser.close();
