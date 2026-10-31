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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:1422");
  await page.getByRole("heading", { name: "Mau buat video apa hari ini?" }).waitFor();

  // C3C2 navigation and quick settings, including hamburger behavior.
  const originalWidth = await page.locator("#sidebar").evaluate((el) => el.getBoundingClientRect().width);
  await page.locator("#sidebar-toggle").click();
  assert.ok((await page.locator("#sidebar").evaluate((el) => el.getBoundingClientRect().width)) < originalWidth);
  assert.equal(await page.locator("#sidebar-toggle").getAttribute("aria-expanded"), "false");
  await page.locator("#sidebar-toggle").click();
  await page.getByRole("button", { name: "Mode Lengkap" }).click();
  assert.equal(await page.locator(".mode-switch [data-mode=pro]").getAttribute("aria-pressed"), "true");
  await page.locator("#dash-ratio").selectOption("9:16");
  await page.locator("#dash-layout").selectOption("side");
  await page.locator("#dash-font").selectOption("gaming");
  assert.equal(await page.locator("#subtitle-sample").getAttribute("data-font"), "gaming");
  await page.locator("#apply-quick").click();
  await page.getByRole("heading", { name: "Atur Video, Tinggal Klik" }).waitFor();
  assert.equal(await page.locator("#c3c-layout").inputValue(), "side");
  assert.equal(await page.locator("#c3c-ratio").inputValue(), "9:16");

  const fixture = fileURLToPath(new URL("./fixtures/two-seconds.webm", import.meta.url));
  async function pick(buttonName) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: buttonName }).click();
    await (await chooser).setFiles(fixture);
  }

  // Regression: V1 alone MUST be functional, no V2 metadata dependency.
  await pick("1 · Pilih video utama");
  await page.waitForFunction(() => !document.getElementById("c3c-play").disabled);
  assert.equal(await page.locator("#c3c-duration").textContent(), "0:02");
  assert.equal(await page.locator("#c3c-overlay-name").textContent(), "Belum dipilih");
  assert.equal(await page.locator("#c3c-stage").getAttribute("data-overlay"), "off");
  await page.getByRole("button", { name: "▶ Putar" }).click();
  await page.waitForFunction(() => document.getElementById("c3c-base").currentTime > 0.15);
  assert.equal(await page.locator("#c3c-overlay").evaluate((v) => v.paused), true);
  await page.getByRole("button", { name: "Ⅱ Jeda" }).click();
  assert.equal(await page.locator("#c3c-base").evaluate((v) => v.paused), true);
  await page.locator("#c3c-scrub").evaluate((input) => {
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => Math.abs(document.getElementById("c3c-base").currentTime - 1) < 0.06);

  // V2 is optional and visual, layout options must really move it.
  await pick("2 · Tambahkan video kedua (opsional)");
  await page.waitForFunction(() => document.getElementById("c3c-overlay").readyState >= 1);
  assert.equal(await page.locator("#c3c-stage").getAttribute("data-overlay"), "on");
  assert.equal(await page.locator("#c3c-overlay").evaluate((v) => v.muted), true);
  await page.locator("#c3c-layout").selectOption("pip");
  assert.ok(await page.locator("#c3c-overlay").evaluate((v) =>
    v.getBoundingClientRect().width < v.parentElement.getBoundingClientRect().width / 2));
  for (const layout of ["side", "stack", "overlay"]) {
    await page.locator("#c3c-layout").selectOption(layout);
    assert.equal(await page.locator("#c3c-stage").getAttribute("data-layout"), layout);
  }
  await page.locator("#c3c-opacity").evaluate((input) => {
    input.value = "25";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await page.locator("#c3c-overlay").evaluate((v) => v.style.opacity), "0.25");
  assert.equal(await page.locator("#c3c-opacity-value").textContent(), "25%");
  await page.locator("#c3c-toggle-overlay").uncheck();
  assert.equal(await page.locator("#c3c-stage").getAttribute("data-overlay"), "off");
  await page.getByRole("button", { name: "▶ Putar" }).click();
  await page.waitForFunction(() => document.getElementById("c3c-base").currentTime > 1.12);
  await page.getByRole("button", { name: "Ⅱ Jeda" }).click();
  await page.locator("#c3c-toggle-overlay").check();
  await page.locator("#c3c-scrub").evaluate((input) => {
    input.value = "0.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() =>
    Math.abs(document.getElementById("c3c-base").currentTime - 0.5) < 0.07 &&
    Math.abs(document.getElementById("c3c-overlay").currentTime - 0.5) < 0.07);

  // Placeholder sections are navigable and honestly disclose unimplemented features.
  await page.locator('nav [data-page="videos"]').click();
  await page.getByRole("heading", { name: "Hasil Video" }).waitFor();
  await page.locator('nav [data-page="ai"]').click();
  await page.getByRole("heading", { name: "Klip Pilihan AI" }).waitFor();
  await page.locator('nav [data-page="publish"]').click();
  await page.getByRole("heading", { name: "Publikasikan Video" }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS C3C2: sidebar, modes, dashboard presets, V1-only play/seek, V2 layouts/seek, pages, no JS errors");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
