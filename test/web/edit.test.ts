import { test, expect } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { loadAgent } from "../../src/agent";
import type { EditCtx } from "../../src/actions";
import { createApp } from "../../src/web/app";
import { register } from "../../src/web/routes/agent-edit";

const T = (slug: string) => "agent-planner" + "@" + slug + ".timer";
const S = (slug: string) => "agent-planner" + "@" + slug + ".service";
const HX = { Host: "127.0.0.1:4317", "HX-Request": "true" };

function fixture() {
  const d = mkdtempSync(join(tmpdir(), "ap-edit-"));
  const agentDir = join(d, "agents");
  const tpl = join(d, "templates");
  const cwd = join(d, "vault");
  mkdirSync(agentDir);
  mkdirSync(tpl);
  mkdirSync(cwd);
  writeFileSync(join(agentDir, "daily.md"), `---\nname: Daily\ncron: "0 7 * * *"\ncwd: ${JSON.stringify(cwd)}\n---\nFasse <b>zusammen</b>.\n`);
  writeFileSync(join(tpl, "repo-lage.md"), `---\nname: Repo-Lage\ncron: "0 8 * * 1-5"\ncwd: /tmp\nicon: "◇"\nsummary: Lage der Repos\nmaxTurns: 40\n---\nPrüfe alle Repos.\n`);
  const calls: string[][] = [];
  const ctx: EditCtx = {
    agentDir, stateDir: join(d, "state"), now: () => new Date(2026, 9, 6, 12), nextRuns: async () => new Map(),
    unitDir: join(d, "units"), systemctl: async (a) => { calls.push(a); }, runnerPath: ["/r"],
    templatesDir: tpl, defaultCwd: cwd, port: 4317,
  };
  return { d, ctx, calls, agentDir, cwd };
}

const post = (app: Hono, path: string, body: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { ...HX, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() }, { ip: "127.0.0.1" });

const fields = (cwd: string, o: Record<string, string> = {}) => ({
  name: "Täglicher Bericht", cron: "0 7 * * *", cwd, model: "", prompt: "Schreibe.", timeout: "30", maxTurns: "100", maxBudgetUsd: "50", ...o,
});

test("GET /agents/new: Formular mit Vorgaben, Live-Prüfung, hx-post", async () => {
  const { ctx, cwd } = fixture();
  const app = await createApp(ctx);
  const res = await app.request("/agents/new", undefined, { ip: "127.0.0.1" });
  expect(res.status).toBe(200);
  const h = await res.text();
  expect(h).toContain("<html");
  expect(h).toContain("Neuer Agent");
  expect(h).toContain('hx-post="/agents"');
  expect(h).toContain('hx-get="/cron/check"');
  expect(h).toContain('hx-trigger="keyup changed delay:300ms"');
  expect(h).toContain(`value="${cwd}"`);
  expect(h).toContain('value="30"');
  expect(h).toContain('value="100"');
  expect(h).toContain('value="50"');
  expect(h).toContain("<details");
  expect(h).toContain('href="/agents/new?template=repo-lage"');
  expect(h).toContain("/css/form.css");
});

test("GET /agents/new?template=: vorbefüllt", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/new?template=repo-lage", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain('value="Repo-Lage"');
  expect(h).toContain('value="0 8 * * 1-5"');
  expect(h).toContain("Prüfe alle Repos.");
  expect(h).toContain('value="40"');
  expect(h).toContain('value="/tmp"'); // cwd der Vorlage gewinnt gegen die Vorgabe
  expect(h).toContain("Wochentags um 08:00");
  const bad = await (await app.request("/agents/new?template=..%2Fx", undefined, { ip: "127.0.0.1" })).text();
  expect(bad).toContain("Vorlage");
});

test("/agents/new greift vor /agents/:slug (auch hinter einer Detailroute mit next())", async () => {
  const { ctx } = fixture();
  const app = new Hono();
  app.get("/agents/:slug", async (c, next) => (c.req.param("slug") === "new" ? next() : c.text("detail")));
  register(app, ctx);
  const res = await app.request("/agents/new", undefined, { ip: "127.0.0.1" });
  expect(await res.text()).toContain("Neuer Agent");
  expect(await (await app.request("/agents/daily", undefined, { ip: "127.0.0.1" })).text()).toBe("detail");
});

test("POST /agents: anlegen, sync, HX-Redirect", async () => {
  const { ctx, calls, agentDir, cwd } = fixture();
  const app = await createApp(ctx);
  const res = await post(app, "/agents", fields(cwd, { model: "claude-sonnet-4-5" }));
  expect(res.status).toBe(200);
  expect(res.headers.get("HX-Redirect")).toBe("/agents/taeglicher-bericht");
  const a = loadAgent(agentDir, "taeglicher-bericht");
  expect(a).toMatchObject({ name: "Täglicher Bericht", model: "claude-sonnet-4-5", enabled: true });
  expect(existsSync(join(ctx.unitDir!, T("taeglicher-bericht")))).toBe(true);
  expect(calls).toContainEqual(["enable", "--now", T("taeglicher-bericht")]);
});

test("POST /agents: Fehler am Feld, Werte bleiben, keine Datei", async () => {
  const { ctx, calls, agentDir, cwd } = fixture();
  const app = await createApp(ctx);
  const res = await post(app, "/agents", fields(cwd, { name: "Daily", cron: "0 8 1 * 1", prompt: "Mein <i>Prompt</i>" }));
  expect(res.status).toBe(200);
  expect(res.headers.get("HX-Redirect")).toBeNull();
  const h = await res.text();
  expect(h.startsWith("<form")).toBe(true);
  expect(h).toContain("vergeben");
  expect(h).toContain("ODER");
  expect(h).toContain('aria-invalid="true"');
  expect(h).toContain('value="0 8 1 * 1"');
  expect(h).toContain("Mein &lt;i&gt;Prompt&lt;/i&gt;");
  expect(existsSync(join(agentDir, "daily.md"))).toBe(true);
  expect(calls).toEqual([]);
  const cwdErr = await (await post(app, "/agents", fields(cwd, { cwd: "/gibt/es/nicht" }))).text();
  expect(cwdErr).toContain("existiert nicht");
});

test("GET /agents/:slug/edit + POST /agents/:slug: bearbeiten, enabled bleibt", async () => {
  const { ctx, agentDir, cwd } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/daily/edit", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain('hx-post="/agents/daily"');
  expect(h).toContain('value="Daily"');
  expect(h).toContain("Fasse &lt;b&gt;zusammen&lt;/b&gt;.");
  expect(h).not.toContain("<b>zusammen</b>");
  writeFileSync(join(agentDir, "daily.md"), readFileSync(join(agentDir, "daily.md"), "utf8").replace("---\nFasse", "enabled: false\n---\nFasse"));
  const res = await post(app, "/agents/daily", fields(cwd, { name: "Daily neu", cron: "30 6 * * *" }));
  expect(res.headers.get("HX-Redirect")).toBe("/agents/daily");
  expect(loadAgent(agentDir, "daily")).toMatchObject({ name: "Daily neu", cron: "30 6 * * *", enabled: false });
  expect((await app.request("/agents/gibtsnicht/edit", undefined, { ip: "127.0.0.1" })).status).toBe(404);
  expect((await post(app, "/agents/gibtsnicht", fields(cwd))).status).toBe(404);
});

test("toggle / run / archive: Antworten für htmx", async () => {
  const { ctx, calls, agentDir } = fixture();
  const app = await createApp(ctx);
  const t = await post(app, "/agents/daily/toggle");
  expect(t.headers.get("HX-Refresh")).toBe("true");
  expect(loadAgent(agentDir, "daily").enabled).toBe(false);
  const r = await post(app, "/agents/daily/run");
  expect(r.headers.get("HX-Refresh")).toBe("true");
  expect(calls).toContainEqual(["start", "--no-block", S("daily")]);
  const a = await post(app, "/agents/daily/archive");
  expect(a.headers.get("HX-Redirect")).toBe("/");
  expect(existsSync(join(agentDir, "_archiv", "daily.md"))).toBe(true);
  expect((await post(app, "/agents/daily/run")).status).toBe(404);
  expect((await post(app, "/agents/..%2Fx/toggle")).status).toBe(404);
});

test("ohne htmx (Route ohne Guard): 303-Redirects", async () => {
  const { ctx } = fixture();
  const app = new Hono();
  register(app, ctx);
  const res = await app.request("/agents/daily/toggle", { method: "POST" }, { ip: "127.0.0.1" });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/agents/daily");
});

test("GET /cron/check: Lesbarform oder Fehler", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  expect(await (await app.request("/cron/check?expr=0%207%20*%20*%20*", undefined, { ip: "127.0.0.1" })).text()).toContain("Täglich um 07:00");
  expect(await (await app.request("/cron/check?cron=0%208%20*%20*%201-5", undefined, { ip: "127.0.0.1" })).text()).toContain("Wochentags um 08:00");
  const bad = await (await app.request("/cron/check?expr=0%207", undefined, { ip: "127.0.0.1" })).text();
  expect(bad).toContain("5 Felder");
  expect(bad).toContain("hint--error");
});

// Review: Schreib- und Sync-Fehler getrennt, Toast für htmx-Fehler
test("POST /agents: Schreibfehler -> keine Weiterleitung, eigene Meldung", async () => {
  const { ctx, cwd, agentDir } = fixture();
  const app = await createApp(ctx);
  chmodSync(agentDir, 0o555);
  try {
    const res = await post(app, "/agents", fields(cwd));
    expect(res.headers.get("HX-Redirect")).toBeNull();
    const h = await res.text();
    expect(h).toContain("Nicht gespeichert");
    expect(h).not.toContain("Zeitplan nicht aktualisiert");
    expect(h).toContain('hx-post="/agents"'); // bleibt Anlegen-Formular
  } finally {
    chmodSync(agentDir, 0o755);
  }
  expect(existsSync(join(agentDir, "taeglicher-bericht.md"))).toBe(false);
});

test("POST /agents: Sync-Fehler -> Datei liegt, Meldung nennt den Zeitplan", async () => {
  const { ctx, cwd, agentDir } = fixture();
  ctx.systemctl = async () => { throw new Error("systemd weg"); };
  const app = await createApp(ctx);
  const h = await (await post(app, "/agents", fields(cwd))).text();
  expect(h).toContain("Gespeichert, aber Zeitplan nicht aktualisiert");
  expect(h).toContain("systemd weg");
  expect(h).toContain('hx-post="/agents/taeglicher-bericht"');
  expect(existsSync(join(agentDir, "taeglicher-bericht.md"))).toBe(true);
});

test("POST /agents: reservierter Name wird abgelehnt", async () => {
  const { ctx, cwd, agentDir } = fixture();
  const app = await createApp(ctx);
  const h = await (await post(app, "/agents", fields(cwd, { name: "new" }))).text();
  expect(h).toContain("reserviert");
  expect(existsSync(join(agentDir, "new.md"))).toBe(false);
});

test("Seite enthält den globalen htmx-Fehler-Handler (Toast)", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/new", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain("htmx:responseError");
  expect(h).toContain("htmx:sendError");
  expect(h).toContain("/css/toast.css");
});

// #13: gültig, aber feuert nie -> Warnung, kein Fehler
test("GET /cron/check: nie feuernder Plan -> Warnung statt Fehler", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/cron/check?expr=0%209%2031%202%20*", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain("af-hint--warn");
  expect(h).toContain("feuert nie");
  expect(h).not.toContain("hint--error");
  expect(h).not.toContain("hint--ok");
});

test("POST /agents: nie feuernder Plan wird gespeichert, Warnung sichtbar", async () => {
  const { ctx, agentDir, cwd } = fixture();
  const app = await createApp(ctx);
  const res = await post(app, "/agents", fields(cwd, { name: "Februar", cron: "0 9 31 2 *" }));
  expect(res.headers.get("HX-Redirect")).toBe("/agents/februar/edit?saved=1");
  expect(loadAgent(agentDir, "februar").cron).toBe("0 9 31 2 *");
  const h = await (await app.request("/agents/februar/edit?saved=1", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain("Gespeichert");
  expect(h).toContain("notice--warn");
  expect(h).toContain("af-hint--warn");
  expect(h).toContain("feuert nie");
  // Bearbeiten: ebenfalls erlaubt, ebenfalls Warnung
  const e = await post(app, "/agents/daily", fields(cwd, { name: "Daily", cron: "0 9 30 2 *" }));
  expect(e.headers.get("HX-Redirect")).toBe("/agents/daily/edit?saved=1");
  expect(loadAgent(agentDir, "daily").cron).toBe("0 9 30 2 *");
  // ohne saved=1 keine Speichern-Meldung, aber Hinweis am Feld
  const plain = await (await app.request("/agents/februar/edit", undefined, { ip: "127.0.0.1" })).text();
  expect(plain).not.toContain("notice--warn");
  expect(plain).toContain("af-hint--warn");
});
