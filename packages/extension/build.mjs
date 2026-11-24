import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const companionOrigin = (() => {
  const raw = process.env.COMPANION_ORIGIN?.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
})();

await mkdir(join(root, "dist"), { recursive: true });
for (const name of ["background", "content", "sidepanel"]) {
  await build({
    entryPoints: [join(root, "src", `${name}.ts`)],
    outfile: join(root, "dist", `${name}.js`),
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: false,
    define: {
      __PHANTOM_COMPANION_ORIGIN__: JSON.stringify(companionOrigin),
    },
  });
}

const manifest = JSON.parse(await readFile(join(root, "public", "manifest.json"), "utf8"));
if (companionOrigin) {
  const matches = new Set(manifest.externally_connectable?.matches ?? []);
  matches.add(`${companionOrigin}/*`);
  manifest.externally_connectable = { matches: [...matches] };
}
await writeFile(join(root, "dist", "manifest.json"), JSON.stringify(manifest, null, 2));

for (const name of ["sidepanel.html", "sidepanel.css", "logo.svg"]) {
  await copyFile(join(root, "public", name), join(root, "dist", name));
}
await mkdir(join(root, "dist", "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await copyFile(join(root, "public", "icons", `icon-${size}.png`), join(root, "dist", "icons", `icon-${size}.png`));
}
