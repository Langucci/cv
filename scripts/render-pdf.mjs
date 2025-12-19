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
  // Strip query/hash, normalize, prevent path traversal
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

async function main() {
  const server = await startServer(4173);
  const base = "http://127.0.0.1:4173";

  const targets = [
    { url: `${base}/`, out: path.join(ROOT, "resume_en.pdf"), expect: "Profile" },
    { url: `${base}/?lang=de`, out: path.join(ROOT, "resume_de.pdf"), expect: "Profil" },
  ];

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    for (const t of targets) {
      await page.goto(t.url, { waitUntil: "networkidle" });

      // Wait until markdown has rendered (h2 exists + expected keyword appears)
      await page.waitForSelector("#md-content h2", { timeout: 15000 });
      await page.waitForFunction((needle) => {
        const el = document.querySelector("#md-content");
        return el && el.textContent && el.textContent.includes(needle);
      }, t.expect, { timeout: 15000 });

      await page.emulateMedia({ media: "print" });
      await page.waitForTimeout(300);

      await page.pdf({
        path: t.out,
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      });

      console.log(`Wrote ${t.out}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
