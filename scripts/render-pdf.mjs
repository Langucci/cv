import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const fileUrl = (p) => "file://" + p.replace(/\\/g, "/");

// Repo root = current working directory in GitHub Actions
const ROOT = process.cwd();
const INDEX = path.join(ROOT, "index.html");

// Output filenames (keep these consistent with your download button logic)
const targets = [
  { url: fileUrl(INDEX), out: path.join(ROOT, "resume_en.pdf"), waitFor: "Profile" },
  { url: fileUrl(INDEX) + "?lang=de", out: path.join(ROOT, "resume_de.pdf"), waitFor: "Profil" }
];

const main = async () => {
  if (!fs.existsSync(INDEX)) {
    throw new Error(`index.html not found at ${INDEX}`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const t of targets) {
    await page.goto(t.url, { waitUntil: "domcontentloaded" });

    // Wait until markdown has been rendered into the DOM
    await page.waitForFunction((needle) => {
      const el = document.querySelector("#md-content");
      return el && el.textContent && el.textContent.includes(needle);
    }, t.waitFor, { timeout: 15000 });

    // Apply print styles
    await page.emulateMedia({ media: "print" });

    // Give fonts/images a moment (esp. profile picture)
    await page.waitForTimeout(500);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" }
    });

    fs.writeFileSync(t.out, pdf);
    console.log(`Wrote ${t.out}`);
  }

  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
