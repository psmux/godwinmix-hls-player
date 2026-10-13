// A static server for ui/, standing in for GitHub Pages: a different origin
// from the mixer, so the stream is fetched across origins exactly as it is
// from a real website. It also serves /embed-test.html, a page that embeds
// the player with the script tag rather than the iframe.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

export function embedTestPage(src) {
  return `<!doctype html><meta charset="utf-8"><title>Script tag embed</title>
<style>body{margin:0;background:#f4f4f4;font:16px system-ui;padding:24px}main{max-width:720px;margin:auto}</style>
<main><h1>A church website</h1><p>Watch the service live:</p>
<script src="/player.js" defer></script>
<godwinmix-player id="p" src="${src.replace(/"/g, "&quot;")}" autoplay muted title="Sunday service"></godwinmix-player>
<p>The player above was put here with one script tag and one element.</p></main>`;
}

export function serve(root, port, src) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/embed-test.html") {
      res.writeHead(200, { "content-type": TYPES[".html"] });
      return res.end(embedTestPage(src));
    }
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(normalize(root))) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
