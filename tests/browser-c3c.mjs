import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const server = await createServer({
  server: { host: "127.0.0.1", port: 1422, strictPort: true },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:1422");
  await page.getByRole("button", { name: /Preview Lab C3C/ }).click();
  await page.getByRole("heading", { name: "Preview Lab — Dua Layer" }).waitFor();
  const fixture = fileURLToPath(new URL("./fixtures/two-seconds.webm", import.meta.url));
  for (const label of ["1 · Pilih video dasar", "2 · Pilih video overlay"]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: label }).click();
    await (await chooser).setFiles(fixture);
  }
  await page.waitForFunction(
    () => !document.getElementById("c3c-play").disabled,
  );
  assert.equal(await page.locator("#c3c-overlay").evaluate((v) => v.muted), true);
  await page.getByRole("button", { name: "▶ Play" }).click();
  await page.waitForFunction(
    () => document.getElementById("c3c-base").currentTime > 0.15,
  );
  await page.getByRole("button", { name: "Ⅱ Pause" }).click();
  assert.equal(await page.locator("#c3c-base").evaluate((v) => v.paused), true);
  await page.locator("#c3c-scrub").evaluate((input) => {
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => Math.abs(document.getElementById("c3c-base").currentTime - 1) < 0.06,
  );
  await page.locator("#c3c-opacity").evaluate((input) => {
    input.value = "25";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await page.locator("#c3c-overlay").evaluate((v) => v.style.opacity), "0.25");
  assert.equal(await page.locator("#c3c-opacity-value").textContent(), "25%");
  assert.deepEqual(errors, []);
  console.log("PASS C3C1: two imports, visible two-layer lab, play, pause, seek, opacity, no JS errors");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
