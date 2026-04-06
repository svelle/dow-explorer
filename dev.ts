/**
 * Development: initial bundle, watch js/ → dist/, and serve on http://127.0.0.1:8080/
 */
import { resolve } from "path";

const root = resolve(import.meta.dir);
const port = Number(process.env.PORT) || 8080;

const buildArgs = [
  "bun",
  "build",
  "js/main.js",
  "--outdir=dist",
  "--target=browser",
  "--sourcemap",
];

const r = Bun.spawnSync(buildArgs, {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);

Bun.spawn([...buildArgs, "--watch"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});

function safePath(pathname: string): string | null {
  const rel = pathname === "/" || pathname === "" ? "index.html" : pathname.replace(/^\//, "");
  const full = resolve(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const path = safePath(url.pathname);
    if (!path) return new Response("Bad path", { status: 400 });
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});

console.log("Dev — http://127.0.0.1:%d/  (watching js/ → dist/main.js)", port);
