import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "dist/acceptance");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (!pathname.startsWith("/fixture/")) {
    response.writeHead(404).end();
    return;
  }
  const path = resolve(root, decodeURIComponent(pathname.slice("/fixture/".length)));
  if (path !== root && !path.startsWith(root + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const file = extname(path) ? path : resolve(root, "index.html");
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
}).listen(Number(process.argv[3] ?? 3032), "localhost");
