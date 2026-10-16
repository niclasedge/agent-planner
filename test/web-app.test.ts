import { test, expect, spyOn } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/web/app";
import type { Ctx } from "../src/web/ctx";
import { html } from "hono/html";
import { layout, cssFiles } from "../src/web/layout";

const now = new Date(2026, 9, 6, 12, 0);

function fixture(extra: Partial<Ctx> = {}) {
  const d = mkdtempSync(join(tmpdir(), "ap-app-"));
  const agents = join(d, "agents");
  const st = join(d, "state");
  mkdirSync(agents);
  const w = (slug: string, fm: string, body: string) => writeFileSync(join(agents, `${slug}.md`), `---\n${fm}\n---\n${body}\n`);
  w("daily", "name: Tägliches Briefing\ncron: '0 7 * * *'\ncwd: /home/u/notes-vault", "Fasse <b>alles</b> zusammen.");
  w("news", "name: AI News\ncron: '0 8 * * 1-5'\ncwd: /home/u/news\nenabled: false", "Suche Neuigkeiten.");
  mkdirSync(join(st, "daily"), { recursive: true });
  writeFileSync(join(st, "daily", "runs.jsonl"), JSON.stringify({
    runId: "r1", slug: "daily", trigger: "schedule", start: new Date(2026, 9, 6, 7, 9).toISOString(), durationMs: 190_000, status: "error",
  }) + "\n");
  const calls = { n: 0 };
  const ctx: Ctx = {
    agentDir: agents, stateDir: st, now: () => now,
    nextRuns: async () => { calls.n++; return new Map([["daily", new Date(2026, 9, 7, 7, 0)]]); },
    ...extra,
  };
  return { ctx, calls };
}

test("GET / zeigt Sidebar, Karten, Pillen, Projekt, letzten Lauf", async () => {
  const { ctx, calls } = fixture();
  const app = await createApp(ctx);
  const res = await app.request("/", undefined, { ip: "127.0.0.1" });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const h = await res.text();
  expect(h).toContain("Geplante Aufgaben");
  expect(h).toContain("Übersicht");
  expect(h).toContain("+ Neuer Agent");
  expect(h).toContain('href="/agents/new"');
  expect(h).toContain('href="/agents/daily"');
  expect(h).toContain("Täglich um 07:00");
  expect(h).toContain("Pausiert");
  expect(h).toContain("notes-vault");
  expect(h).toContain("heute 07:09");
  expect(h).toContain("3 min 10 s");
  expect(h).toContain("morgen 07:00"); // Sidebar: nächster Lauf
  expect(h).toContain("—"); // news ohne Timer
  expect(h).toContain("status-dot--error"); // letzter Lauf Fehler
  expect(h).toContain("/vendor/htmx.min.js");
  expect(h).toContain("/css/base.css");
  expect(h).not.toContain("<b>alles</b>"); // escaped
  expect(calls.n).toBe(1); // eine systemctl-Abfrage je Seite
});

test("Sortierung: Vorgabe nächste Ausführung, ?sort=name", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const byNext = await (await app.request("/", undefined, { ip: "127.0.0.1" })).text();
  expect(byNext.indexOf("Tägliches Briefing")).toBeLessThan(byNext.indexOf("AI News", byNext.indexOf('id="cards"')));
  const byName = await (await app.request("/?sort=name", undefined, { ip: "127.0.0.1" })).text();
  const cards = byName.slice(byName.indexOf('id="cards"'));
  expect(cards.indexOf("AI News")).toBeLessThan(cards.indexOf("Tägliches Briefing"));
});

test("htmx-Anfrage liefert nur das Kartenraster", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const res = await app.request("/?sort=name", { headers: { "HX-Request": "true" } }, { ip: "127.0.0.1" });
  const h = await res.text();
  expect(h.startsWith("<div")).toBe(true);
  expect(h).toContain('id="cards"');
  expect(h).not.toContain("<html");
  expect(res.headers.get("vary")?.toLowerCase()).toContain("hx-request");
});

test("leerer Bestand: Hinweis statt Karten", async () => {
  const { ctx } = fixture({ agentDir: join(tmpdir(), "gibt-es-nicht-xyz") });
  const app = await createApp(ctx);
  const h = await (await app.request("/", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain("Noch keine Agenten");
});

test("/agents/new zeigt das Formular, /agents/:slug", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  expect((await app.request("/agents/new", undefined, { ip: "127.0.0.1" })).status).toBe(200);
  const ok = await app.request("/agents/daily", undefined, { ip: "127.0.0.1" });
  expect(ok.status).toBe(200);
  expect(await ok.text()).toContain("Tägliches Briefing");
  expect((await app.request("/agents/gibtsnicht", undefined, { ip: "127.0.0.1" })).status).toBe(404);
});

test("statische Dateien aus public/, kein Ausbruch", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const css = await app.request("/css/base.css", undefined, { ip: "127.0.0.1" });
  expect(css.status).toBe(200);
  expect(css.headers.get("content-type")).toContain("text/css");
  expect((await app.request("/vendor/htmx.min.js", undefined, { ip: "127.0.0.1" })).status).toBe(200);
  expect((await app.request("/css/%2e%2e/%2e%2e/package.json", undefined, { ip: "127.0.0.1" })).status).toBe(404);
  expect((await app.request("/css/nix.css", undefined, { ip: "127.0.0.1" })).status).toBe(404);
});

test("#12: kaputt kodierte Pfade geben 404 statt 500", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  expect((await app.request("/css/%25", undefined, { ip: "127.0.0.1" })).status).toBe(404);
  expect((await app.request("/css/a%00.css", undefined, { ip: "127.0.0.1" })).status).toBe(404);
  expect((await app.request("/vendor/%25zz", undefined, { ip: "127.0.0.1" })).status).toBe(404);
});

test("cssFiles: base zuerst, Rest alphabetisch", () => {
  const d = mkdtempSync(join(tmpdir(), "ap-css-"));
  mkdirSync(join(d, "css"));
  for (const f of ["detail.css", "base.css", "agent-form.css"]) writeFileSync(join(d, "css", f), "");
  expect(cssFiles(d)).toEqual(["/css/base.css", "/css/agent-form.css", "/css/detail.css"]);
});

test("layout(title, sidebar, main) escaped Titel, enthält Teile", () => {
  const h = String(layout("A <b>", html`<nav>S</nav>`, html`<main>M</main>`, { css: ["/css/base.css"] }));
  expect(h).toContain("<title>A &lt;b&gt; · agent-planner</title>");
  expect(h).toContain("<nav>S</nav>");
  expect(h).toContain("<main>M</main>");
  expect(h).toContain('lang="de"');
});

test("Routenmodule per Glob: neues Modul wird geladen", async () => {
  const { ctx } = fixture();
  const dir = mkdtempSync(join(tmpdir(), "ap-routes-"));
  writeFileSync(join(dir, "extra.ts"), `export function register(app: any) { app.get("/extra", (c: any) => c.text("da")); }`);
  const app = await createApp(ctx, { routesDir: dir });
  expect(await (await app.request("/extra", undefined, { ip: "127.0.0.1" })).text()).toBe("da");
});

test("#12: kaputtes Routenmodul wird übersprungen und auf stderr gemeldet", async () => {
  const { ctx } = fixture();
  const dir = mkdtempSync(join(tmpdir(), "ap-routes-"));
  writeFileSync(join(dir, "a-kaputt.ts"), `export function register(app: any) { app.get("/a", (c: any) => c.text("a"); }`);
  writeFileSync(join(dir, "b-ohne.ts"), `export const x = 1;`);
  writeFileSync(join(dir, "c-wirft.ts"), `export function register() { throw new Error("boom"); }`);
  writeFileSync(join(dir, "d-gut.ts"), `export function register(app: any) { app.get("/gut", (c: any) => c.text("gut")); }`);
  const err = spyOn(console, "error").mockImplementation(() => {});
  try {
    const app = await createApp(ctx, { routesDir: dir });
    expect(await (await app.request("/gut", undefined, { ip: "127.0.0.1" })).text()).toBe("gut");
    const out = err.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("a-kaputt.ts");
    expect(out).toContain("b-ohne.ts");
    expect(out).toContain("c-wirft.ts");
    expect(out).toContain("boom");
    expect(out).not.toContain("d-gut.ts");
  } finally {
    err.mockRestore();
  }
});

test("#12: Sidebar nach Name, Karten nach nächstem Lauf", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/", undefined, { ip: "127.0.0.1" })).text();
  const nav = h.slice(h.indexOf('id="nav"'), h.indexOf("</nav>"));
  expect(nav.indexOf("AI News")).toBeLessThan(nav.indexOf("Tägliches Briefing"));
  const cards = h.slice(h.indexOf('id="cards"'));
  expect(cards.indexOf("Tägliches Briefing")).toBeLessThan(cards.indexOf("AI News"));
});

test("#12: htmx.org nur in devDependencies", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
  expect(pkg.dependencies?.["htmx.org"]).toBeUndefined();
  expect(pkg.devDependencies?.["htmx.org"]).toBeDefined();
});

test("#12/#9: Übersicht zeigt „Gestoppt“ statt rohem stopped, Stil neutral", async () => {
  const { ctx } = fixture();
  mkdirSync(join(ctx.stateDir, "news"), { recursive: true });
  writeFileSync(join(ctx.stateDir, "news", "runs.jsonl"), JSON.stringify({
    runId: "s1", slug: "news", trigger: "manual", start: new Date(2026, 9, 6, 8, 0).toISOString(), durationMs: 5_000, status: "stopped",
  }) + "\n");
  const h = await (await (await createApp(ctx)).request("/", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain('<span class="state state--stopped">Gestoppt</span>');
  expect(h).not.toContain(">stopped<");
  const css = readFileSync(join(import.meta.dir, "../public/css/base.css"), "utf8");
  const rule = css.split("\n").find((l) => /\.state--stopped\b/.test(l)) ?? "";
  expect(rule).not.toBe("");
  expect(rule).not.toContain("--red");
});
