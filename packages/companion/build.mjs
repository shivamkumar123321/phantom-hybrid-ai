import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const debugToken = isProd ? "" : (process.env.FIREBASE_APPCHECK_DEBUG_TOKEN ?? "");

await mkdir(join(root, "dist"), { recursive: true });
await build({
  entryPoints: [join(root, "src", "main.tsx")],
  outfile: join(root, "dist", "main.js"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  target: "chrome120",
  minify: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify(isProd ? "production" : "development"),
    "process.env.VITE_FIREBASE_API_KEY": JSON.stringify(process.env.VITE_FIREBASE_API_KEY ?? ""),
    "process.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN ?? ""),
    "process.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID ?? ""),
    "process.env.VITE_FIREBASE_APP_ID": JSON.stringify(process.env.VITE_FIREBASE_APP_ID ?? ""),
    "process.env.VITE_RECAPTCHA_SITE_KEY": JSON.stringify(process.env.VITE_RECAPTCHA_SITE_KEY ?? ""),
    "process.env.FIREBASE_APPCHECK_DEBUG_TOKEN": JSON.stringify(debugToken),
  },
});
await copyFile(join(root, "..", "..", "node_modules", "@xyflow/react", "dist", "style.css"), join(root, "dist", "xyflow.css"));
for (const name of ["index.html", "styles.css"]) {
  await copyFile(join(root, "public", name), join(root, "dist", name));
}
