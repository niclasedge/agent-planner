import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { Ctx } from "./ctx";
import { guard } from "./guard";
import { publicDir } from "./layout";

const MIME: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  woff2: "font/woff2",
  json: "application/json",
};

const defaultRoutesDir = join(import.meta.dir, "routes");

/**
 * Jedes Modul unter routes/ exportiert `register(app, ctx)`; alphabetisch geladen (zz-* zuletzt).
 * Ein Modul, das beim Import oder in `register` wirft oder kein `register` hat, wird übersprungen und auf stderr gemeldet (#12).
 */
export async function createApp(ctx: Ctx, opts: { routesDir?: string; publicDir?: string } = {}): Promise<Hono> {
  const app = new Hono();
  const pub = opts.publicDir ?? publicDir;
  const dir = opts.routesDir ?? defaultRoutesDir;

  guard(app, ctx); // vor allen Routen, auch den statischen
  app.get("/css/:file{.+}", staticFile(pub, "css"));
  app.get("/vendor/:file{.+}", staticFile(pub, "vendor"));

  const mods = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
  for (const f of mods) {
    try {
      const mod = await import(join(dir, f));
      if (typeof mod.register !== "function") throw new Error("exportiert kein register(app, ctx)");
      mod.register(app, ctx);
    } catch (e) {
      console.error(`agent-planner: Routenmodul ${f} übersprungen: ${(e as Error)?.message ?? e}`);
    }
  }
  return app;
}

function staticFile(pub: string, sub: string) {
  const root = join(pub, sub);
  return async (c: any) => {
    const path = join(root, c.req.param("file")); // Hono hat den Parameter bereits dekodiert (#12)
    if (!path.startsWith(root + "/")) return c.notFound();
    let f: ReturnType<typeof Bun.file>;
    try {
      f = Bun.file(path);
      if (!(await f.exists())) return c.notFound();
    } catch {
      return c.notFound(); // z. B. Nullbyte im Pfad
    }
    const ext = path.split(".").pop() ?? "";
    return new Response(f, { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-cache" } });
  };
}
