import http from "http";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

function resolveFileFromPathname(pathname) {
  let p = pathname === "/" ? "/index.html" : pathname;
  if (p.endsWith("/")) p += "index.html";

  const resolved = path.normalize(path.join(ROOT, p));
  if (!resolved.startsWith(ROOT)) return null;

  return resolved;
}

function startServer(port = 4173) {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = u.pathname;

      const filePath = resolveFileFromPathname(pathname);
      if (!filePath) {
        res.writeHead(403);
        return res.end("Forbidden");
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end("Not found");
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    } catch (e) {
      res.writeHead(500);
      res.end("Server error");
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function renderOne(browser, url, outPath, expectNeedle, label) {
  const page = await browser.newPage();

  page.on("console", (msg) => console.log(`[${label}] console:`, msg.type(), msg.text()));
  page.on("requestfailed", (req) =>
    console.log(`[${label}] requestfailed:`, req.url(), req.failure()?.errorText)
  );
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/content/")) console.log(`[${label}] response:`, res.status(), u);
  });

  try {
    console.log(`Rendering: ${url}`);

    // More deterministic than networkidle for pages that load CDN assets/fonts
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait until markdown is rendered into HTML (and contains a known needle)
    await page.waitForFunction((needle) => {
      const el = document.querySelector("#md-content");
      const t = (el?.textContent || "").trim();
      return t.length > 200 && t.includes(needle);
    }, expectNeedle, { timeout: 45000 });

    // Ensure fonts/layout are settled
    await page.waitForTimeout(250);

    // Print mode
    await page.emulateMedia({ media: "print" });

    // Small extra settle time after switching media
    await page.waitForTimeout(250);

    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,

      // Let @page size/margins be respected if you set them in CSS
      preferCSSPageSize: true,

      // Keep margins explicit (matches your CSS @page)
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },

      // Gentle nudge to avoid spilling to a 3rd page (usually invisible)
      scale: 0.98,
    });

    console.log(`Wrote ${outPath}`);
  } catch (e) {
    await page.screenshot({ path: path.join(ROOT, `debug_${label}.png`), fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => "");
    fs.writeFileSync(path.join(ROOT, `debug_${label}.html`), html);
    const mdText = await page.evaluate(() => document.querySelector("#md-content")?.textContent || "").catch(() => "");
    fs.writeFileSync(path.join(ROOT, `debug_${label}_mdcontent.txt`), mdText);

    console.error(`Failed rendering ${url}:`, e);
    throw e;
  } finally {
    await page.close();
  }
}

async function main() {
  const server = await startServer(4173);
  const base = "http://127.0.0.1:4173";

  const browser = await chromium.launch();
  try {
    await renderOne(browser, `${base}/`, path.join(ROOT, "resume_en.pdf"), "Profile", "en");
    await renderOne(browser, `${base}/?lang=de`, path.join(ROOT, "resume_de.pdf"), "Profil", "de");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
