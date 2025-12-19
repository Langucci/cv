import { chromium } from "playwright";
import fs from "fs";

const url = "https://langucci.github.io/cv/"; // Your CV page URL
const outPath = "resume.pdf"; // This is the PDF file name that matches your download link

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#md-content h2");
  await page.emulateMedia({ media: "print" });

  const pdf = await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" }
  });

  fs.writeFileSync(outPath, pdf);
  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
