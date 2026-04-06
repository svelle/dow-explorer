/**
 * Static file server (use after `bun run build`). Serves repo root so /index.html and /dist/main.js resolve.
 */
import { resolve } from "path";

const root = resolve(import.meta.dir);
const port = Number(process.env.PORT) || 8080;

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

console.log("http://127.0.0.1:%d/  (Ctrl+C to stop)", port);
