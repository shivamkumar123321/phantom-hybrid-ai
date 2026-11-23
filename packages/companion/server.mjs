import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(root, "dist", "index.html"));
const styles = await readFile(join(root, "dist", "styles.css"));
const script = await readFile(join(root, "dist", "main.js"));
const port = Number(process.env.PORT || 4174);

createServer((request, response) => {
  const path = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
  if (path === "/styles.css") { response.writeHead(200, { "content-type": "text/css; charset=utf-8" }); response.end(styles); return; }
  if (path === "/main.js") { response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" }); response.end(script); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}).listen(port, "127.0.0.1", () => console.log(`AI Companion: http://127.0.0.1:${port}`));
