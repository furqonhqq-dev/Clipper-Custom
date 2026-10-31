import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const server = await createServer({
  server: { host: "127.0.0.1", port: 1421, strictPort: true },
});
await server.listen();
let browser;
(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:1421");
  await page
    .getByRole("heading", { name: "Cerita hebat dimulai dari satu klip." })
    .waitFor();
  assert.equal(await page.locator("article").count(), 4);
  await page.getByRole("button", { name: "Proyek", exact: false }).click();
  await page.getByRole("heading", { name: "Proyek", exact: true }).waitFor();
  await page.getByRole("button", { name: "Pengaturan", exact: false }).click();
  await page
    .getByRole("heading", { name: "Pengaturan", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Buat Klip", exact: false }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Pilih video", exact: true }).click();
  await (
    await chooserPromise
  ).setFiles(
    fileURLToPath(new URL("./fixtures/two-seconds.webm", import.meta.url)),
  );
  await page.waitForFunction(
    () => document.querySelector("#duration").textContent === "0:02",
  );
  await page.locator("#video").evaluate((v) => v.play());
  await page.waitForFunction(
    () => document.querySelector("#video").currentTime > 0,
  );
  for (const ratio of ["9:16", "1:1", "16:9"]) {
    await page.locator("#ratio").selectOption(ratio);
    assert.ok(
      await page
        .locator("#preview-frame")
        .evaluate(
          (el, cls) => el.classList.contains(cls),
          `ratio-${ratio.replace(":", "-")}`,
        ),
    );
  }
  await page.evaluate(async () => {
    const response = await fetch(document.querySelector("#video").src);
    const data = new DataTransfer();
    data.items.add(
      new File([await response.blob()], "drop.webm", { type: "video/webm" }),
    );
    window.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#filename").textContent === "drop.webm" &&
      document.querySelector("#duration").textContent === "0:02",
  );
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "bad.exe"));
    window.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  assert.match(await page.locator("#status").textContent(), /tidak didukung/);
  assert.equal(await page.locator("#filename").textContent(), "drop.webm");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: navigation, planned modules, file picker, duration, playback, 3 ratios, drop import, invalid-file handling; no page errors",
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    await server.close();
  });
