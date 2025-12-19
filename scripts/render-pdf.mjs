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

function safePath(urlPath) {
  const clean = urlPath.split("?")[0].split("#")[0];
  const resolved = path.normalize(path.join(ROOT, clean));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function startServer(port = 4173) {
  const server = http.createServer((req, res) => {
    const reqUrl = req.url || "/";
    const filePath = safePath(reqUrl === "/" ? "/index.html" : reqUrl);

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
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function renderOne(browser, url, outPath, expectNeedle) {
  const page = await browser.newPage();
  try {
    console.log(`Rendering: ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });

    // Wait until markdown has been injected (more robust than waiting for h2)
    await page.waitForFunction(() => {
      const el = document.querySelector("#md-content");
      return el && el.textContent && el.textContent.trim().length > 200;
    }, { timeout: 30000 });

    // Confirm the language-specific keyword appears somewhere
    await page.waitForFunction((needle) => {
      const el = document.querySelector("#md-content");
      return el && el.textContent && el.textContent.includes(needle);
    }, expectNeedle, { timeout: 30000 });

    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(300);

    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });

    console.log(`Wrote ${outPath}`);
  } catch (e) {
    // Debug helpers
    const stamp = expectNeedle === "Profil" ? "de" : "en";
    await page.screenshot({ path: path.join(ROOT, `debug_${stamp}.png`), fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => "");
    fs.writeFileSync(path.join(ROOT, `debug_${stamp}.html`), html);
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
    await renderOne(
      browser,
      `${base}/`,
      path.join(ROOT, "resume_en.pdf"),
      "Profile"
    );

    await renderOne(
      browser,
      `${base}/?lang=de`,
      path.join(ROOT, "resume_de.pdf"),
      "Profil"
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
