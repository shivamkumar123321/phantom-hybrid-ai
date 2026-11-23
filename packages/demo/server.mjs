import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(root, "dist", "index.html"));
const backup = await readFile(join(root, "dist", "backup.svg"));
const port = Number(process.env.PORT || 4173);
createServer((request, response) => {
  if (request.url === "/backup.svg") { response.writeHead(200, { "content-type": "image/svg+xml" }); response.end(backup); return; }
  if (request.url?.startsWith("/missing-")) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}).listen(port, "127.0.0.1", () => console.log(`Demo Website: http://127.0.0.1:${port}`));
