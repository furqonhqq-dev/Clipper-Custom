import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ server:{host:"127.0.0.1",port:1423,strictPort:true} });
await server.listen();
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true});
  const page = await browser.newPage({viewport:{width:1360,height:860}});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:1423");
  await page.locator('nav [data-page="ai"]').click();
  await page.getByRole("heading",{name:"Cari Kandidat Klip"}).waitFor();
  assert.equal(await page.locator("#p0-analyze").isDisabled(),true);

  const toTime = (n) => `00:${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")},000`;
  const content = Array.from({length:45},(_,i) => {
    const text = i%4===0
      ? "Bagaimana cara memahami masalah ini? Ini contoh penting yang bisa dilakukan oleh semua orang."
      : "Banyak hal menarik dibahas dengan penjelasan langkah dan pengalaman nyata dalam kehidupan.";
    return `${i+1}\n${toTime(i*2)} --> ${toTime(i*2+2)}\n${text}\n`;
  }).join("\n");
  await page.locator("#p0-caption-file").setInputFiles({
    name:"podcast.srt",mimeType:"text/plain",buffer:Buffer.from(content,"utf-8"),
  });
  await page.waitForFunction(()=>!document.getElementById("p0-analyze").disabled);
  await page.locator("#p0-count").selectOption("3");
  await page.locator("#p0-analyze").click();
  await page.locator(".p0-result").first().waitFor();
  assert.ok(await page.locator(".p0-result").count()>=1);
  assert.ok(await page.locator(".p0-result").count()<=3);
  assert.match(await page.locator("#p0-method").textContent(),/bukan model AI/);
  const originalTitle = await page.locator(".p0-result input[type=text]").first().inputValue();
  assert.ok(originalTitle.length>5);
  await page.locator(".p0-result input[type=text]").first().fill("Judul saya sendiri");
  assert.equal(await page.locator(".p0-result input[type=text]").first().inputValue(),"Judul saya sendiri");
  await page.locator(".p0-result .p0-pick input").first().check();
  assert.match(await page.locator("#p0-selected").textContent(),/1 kandidat/);

  await page.locator(".p0-result button").first().click();
  assert.match(await page.locator("#p0-status").textContent(),/Pilih video sumber terlebih dahulu/);

  // Fresh captions and malformed captions never create fake ranked cards.
  await page.locator("#p0-caption-file").setInputFiles({
    name:"broken.srt",mimeType:"text/plain",buffer:Buffer.from("not a timed transcript"),
  });
  await page.waitForFunction(()=>document.getElementById("p0-analyze").disabled);
  assert.match(await page.locator("#p0-status").textContent(),/Transkrip belum bisa diproses/);
  assert.deepEqual(errors,[]);
  console.log("PASS P0-01: real SRT ranking, editable suggested titles, candidate pick, preview guard, invalid data and no JS exceptions");
} catch(error) {
  console.error(error);
  process.exitCode=1;
} finally {
  await browser?.close();
  await server.close();
}
