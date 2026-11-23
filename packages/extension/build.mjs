import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
await mkdir(join(root, "dist"), { recursive: true });
for (const name of ["background", "content", "sidepanel"]) {
  await build({
    entryPoints: [join(root, "src", `${name}.ts`)],
    outfile: join(root, "dist", `${name}.js`),
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: false,
  });
}
for (const name of ["manifest.json", "sidepanel.html", "sidepanel.css"]) {
  await copyFile(join(root, "public", name), join(root, "dist", name));
}
