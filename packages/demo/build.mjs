import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
await mkdir(join(root, "dist"), { recursive: true });
await copyFile(join(root, "public", "index.html"), join(root, "dist", "index.html"));
await copyFile(join(root, "public", "backup.svg"), join(root, "dist", "backup.svg"));
await copyFile(join(root, "public", "favicon.svg"), join(root, "dist", "favicon.svg"));
