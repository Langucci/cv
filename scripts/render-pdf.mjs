import { chromium } from "playwright";
import fs from "fs";

const targets = [
  { url: "https://langucci.github.io/cv/", out: "resume_en.pdf" },
  { url: "https://langucci.github.io/cv/?lang=de", out: "resume_de.pdf" }
];

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const t of targets) {
    await page.goto(t.url, { waitUntil: "networkidle" });
    await page.waitForSelector("#md-content h2");  // ensures markdown loaded
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(500);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" }
    });

    fs.writeFileSync(t.out, pdf);
  }

  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
