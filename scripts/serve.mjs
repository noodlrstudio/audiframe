import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = process.cwd();
for (const port of [4100, 4101])
  createServer(async (req, res) => {
    const path = resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (!path.startsWith(root + "/")) {
      res.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(
        new URL(req.url, "http://localhost").pathname.endsWith("/")
          ? path + "/index.html"
          : path,
      );
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".json": "application/json",
          ".css": "text/css",
        }[
          new URL(req.url, "http://localhost").pathname.endsWith("/")
            ? ".html"
            : extname(path)
        ] ?? "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  }).listen(port, "127.0.0.1", () =>
    console.log(
      `http://127.0.0.1:${port}/examples/${port === 4100 ? "minimal-host" : "minimal-app"}/`,
    ),
  );
