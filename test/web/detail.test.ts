import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/web/app";
import type { Ctx } from "../../src/web/ctx";
import { buildCards, readRunDetail } from "../../src/web/data";
import { parseAgent } from "../../src/agent";

const now = new Date(2026, 9, 6, 12, 0);
const iso = (m: number, d: number, h: number, mi: number) => new Date(2026, m, d, h, mi).toISOString();

const R3 = "20261006T050900-cccccc";
const R2 = "20261005T050900-bbbbbb";
const R1 = "20261004T050800-aaaaaa";

function fixture() {
  const d = mkdtempSync(join(tmpdir(), "ap-detail-"));
  const agents = join(d, "agents");
  const st = join(d, "state");
  mkdirSync(agents);
  const w = (slug: string, fm: string, body: string) => writeFileSync(join(agents, `${slug}.md`), `---\n${fm}\n---\n${body}\n`);
  w("daily", "name: Tägliches Briefing\ncron: '0 7 * * *'\ncwd: /home/u/notes-vault", "**Fasse** zusammen <script>alert(1)</script>");
  w("news", "name: AI News\ncron: '0 8 * * 1-5'\ncwd: /home/u/news\nenabled: false", "x".repeat(700));
  w("live", "name: Läuft gerade\ncron: '0 9 * * *'\ncwd: /home/u/live", "Warte.");
  const put = (slug: string, rows: object[]) => {
    mkdirSync(join(st, slug), { recursive: true });
    writeFileSync(join(st, slug, "runs.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  };
  put("daily", [
    { runId: R1, slug: "daily", trigger: "manual", start: iso(9, 4, 7, 8), durationMs: 5000, status: "success", turns: 2, costUsd: 0.1 },
    { runId: R2, slug: "daily", trigger: "schedule", start: iso(9, 5, 7, 9), durationMs: 1000, status: "error", error: "Rate <b>limit</b>" },
    { runId: R3, slug: "daily", trigger: "schedule", start: iso(9, 6, 7, 9), durationMs: 190_000, status: "success", turns: 17, costUsd: 0.88 },
  ]);
  put("live", [{ runId: "20261006T090000-llllll", slug: "live", trigger: "manual", start: iso(9, 6, 9, 0), status: "running", pid: process.pid }]);
  const msgs = [
    { type: "system", subtype: "init" },
    { type: "assistant", message: { content: [{ type: "text", text: "Ich lese." }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/home/u/notes-vault/Daily.md" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "..." }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "Bash", input: { command: "ls -la", description: "Liste" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t3", name: "Custom", input: { a: 1, b: "<x>" } }] } },
    { type: "result", subtype: "success", result: "## Briefing\n\n- **Punkt** eins\n\n<script>alert(2)</script>", num_turns: 17, total_cost_usd: 0.88 },
  ];
  writeFileSync(join(st, "daily", `${R3}.jsonl`), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
  const ctx: Ctx = {
    agentDir: agents, stateDir: st, now: () => now,
    nextRuns: async () => new Map([["daily", new Date(2026, 9, 7, 7, 0)], ["live", new Date(2026, 9, 7, 9, 0)]]),
  };
  return { ctx, st };
}

const between = (h: string, a: string, b: string) => h.slice(h.indexOf(a), h.indexOf(b, h.indexOf(a)));

test("Detail: Kopf mit Schalter, Pille, nächster Ausführung, Aktionen (#5-Schnittstelle)", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const res = await app.request("/agents/daily", undefined, { ip: "127.0.0.1" });
  expect(res.status).toBe(200);
  const h = await res.text();
  expect(h).toContain("Tägliches Briefing");
  expect(h).toContain('hx-post="/agents/daily/toggle"');
  expect(h).toContain('aria-checked="true"');
  expect(h).toContain(">Aktiv<");
  expect(h).toContain("Nächste Ausführung: morgen um 07:00");
  expect(h).toContain('href="/agents/daily/edit"');
  expect(h).toContain('hx-post="/agents/daily/archive"');
  expect(h).toContain("hx-confirm=");
  expect(h).toContain('hx-post="/agents/daily/run"');
  expect(h).toContain("Jetzt ausführen");
});

test("Detail: Einstellungen rechts, Prompt als sicheres Markdown", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/daily", undefined, { ip: "127.0.0.1" })).text();
  for (const s of ["Anweisungen", "Projekt", "notes-vault", "Wiederholung", "Täglich um 07:00", "Berechtigungen", "Automatisch genehmigen", "Auto Mode", "Grenzen", "30 min · 100 Turns · 50 USD"]) {
    expect(h).toContain(s);
  }
  expect(h).toContain("<strong>Fasse</strong>");
  expect(h).not.toContain("<script>alert(1)");
});

test("Detail: pausierter Agent, langer Prompt wird ausgeblendet", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/news", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain(">Pausiert<");
  expect(h).toContain('aria-checked="false"');
  expect(h).not.toContain("Nächste Ausführung: ");
  expect(h).toContain("prompt--long");
  expect(h).toContain("Mehr anzeigen");
  const short = await (await app.request("/agents/daily", undefined, { ip: "127.0.0.1" })).text();
  expect(short).not.toContain("prompt--long");
});

test("Verlauf: neueste zuerst, Beschriftung, · Manuell, Punkte", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/daily", undefined, { ip: "127.0.0.1" })).text();
  const v = between(h, 'id="verlauf"', "</ul>");
  const i3 = v.indexOf("Heute um 07:09");
  const i2 = v.indexOf("Gestern um 07:09");
  const i1 = v.indexOf("4. Okt. um 07:08 · Manuell");
  expect(i3).toBeGreaterThan(-1);
  expect(i2).toBeGreaterThan(i3);
  expect(i1).toBeGreaterThan(i2);
  expect(v).toContain(`href="/agents/daily/runs/${R3}"`);
  expect(v).toContain(`hx-get="/agents/daily/runs/${R3}"`);
  // ohne seen.json: alle beendeten ungelesen; Fehler rot
  expect(v.match(/run-dot--unread/g)?.length).toBe(2);
  expect(v.match(/run-dot--error/g)?.length).toBe(1);
});

test("Verlauf: Agent ohne Läufe", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/news", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain("Noch keine Läufe");
});

test("Detail: unbekannter Slug 404, ungültiger Slug 404", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  expect((await app.request("/agents/gibtsnicht", undefined, { ip: "127.0.0.1" })).status).toBe(404);
  expect((await app.request("/agents/..%2Fx", undefined, { ip: "127.0.0.1" })).status).toBe(404);
});

test("/agents/new wird durchgereicht, nicht als Slug behandelt", async () => {
  const { ctx } = fixture();
  const dir = mkdtempSync(join(tmpdir(), "ap-routes-"));
  const src = join(import.meta.dir, "../../src/web/routes/agent-detail.ts");
  writeFileSync(join(dir, "a-detail.ts"), `export { register } from ${JSON.stringify(src)};`);
  writeFileSync(join(dir, "b-new.ts"), `export function register(app: any) { app.get("/agents/new", (c: any) => c.text("formular")); }`);
  const app = await createApp(ctx, { routesDir: dir });
  const res = await app.request("/agents/new", undefined, { ip: "127.0.0.1" });
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("formular");
});

test("Lauf-Detail: Ergebnis, Kennzahlen, Werkzeugaufrufe", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const res = await app.request(`/agents/daily/runs/${R3}`, undefined, { ip: "127.0.0.1" });
  expect(res.status).toBe(200);
  const h = await res.text();
  expect(h).toContain("<html");
  expect(h).toContain("<h2>Briefing</h2>");
  expect(h).toContain("<strong>Punkt</strong>");
  expect(h).not.toContain("<script>alert(2)");
  for (const s of ["Erfolgreich", "3 min 10 s", "17", "0,88 USD", "Zeitplan", "06.10.2026 07:09"]) expect(h).toContain(s);
  const tools = between(h, "<details", "</details>");
  expect(tools).toContain("Werkzeugaufrufe (3)");
  expect(tools).toContain("Read");
  expect(tools).toContain("/home/u/notes-vault/Daily.md");
  expect(tools).toContain("Bash");
  expect(tools).toContain("ls -la");
  expect(tools).toContain("&lt;x&gt;");
  expect(h).not.toContain('hx-trigger="every 3s"');
  // gewählter Lauf aktiv im Verlauf
  expect(between(h, 'id="verlauf"', "</ul>")).toContain("is-active");
});

test("Lauf-Detail: Fehler zeigt Meldung escaped, Auslöser manuell", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request(`/agents/daily/runs/${R2}`, undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain("Fehler");
  expect(h).toContain("Rate &lt;b&gt;limit&lt;/b&gt;");
  expect(h).toContain("Keine Werkzeugaufrufe");
  const m = await (await app.request(`/agents/daily/runs/${R1}`, undefined, { ip: "127.0.0.1" })).text();
  expect(m).toContain("Manuell");
});

test("Lauf-Detail: htmx-Fragment mit oob-Verlauf und -Sidebar", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const res = await app.request(`/agents/daily/runs/${R3}`, { headers: { "HX-Request": "true" } }, { ip: "127.0.0.1" });
  const h = await res.text();
  expect(h).not.toContain("<html");
  expect(h).toContain('id="detail-panel"');
  expect(h).toMatch(/id="verlauf"[^>]*hx-swap-oob="true"/);
  expect(h).toMatch(/id="nav"[^>]*hx-swap-oob="true"/);
  expect(res.headers.get("vary")?.toLowerCase()).toContain("hx-request");
  // Zurück zur Agent-Ansicht als Fragment
  const back = await (await app.request("/agents/daily", { headers: { "HX-Request": "true" } }, { ip: "127.0.0.1" })).text();
  expect(back).not.toContain("<html");
  expect(back).toContain("Anweisungen");
  expect(back).toMatch(/id="verlauf"[^>]*hx-swap-oob="true"/);
});

test("Lauf-Detail: laufender Lauf pollt alle 3 s", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  const h = await (await app.request("/agents/live/runs/20261006T090000-llllll", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain('hx-trigger="every 3s"');
  expect(h).toContain('hx-get="/agents/live/runs/20261006T090000-llllll"');
  expect(h).toContain("Läuft");
});

test("Lauf-Detail: unbekannte oder ungültige runId 404", async () => {
  const { ctx } = fixture();
  const app = await createApp(ctx);
  expect((await app.request("/agents/daily/runs/20990101T000000-zzzzzz", undefined, { ip: "127.0.0.1" })).status).toBe(404);
  expect((await app.request("/agents/daily/runs/..%2F..%2Fx", undefined, { ip: "127.0.0.1" })).status).toBe(404);
  expect((await app.request(`/agents/gibtsnicht/runs/${R3}`, undefined, { ip: "127.0.0.1" })).status).toBe(404);
});

test("Lesestatus: Öffnen markiert gelesen, jüngere bleiben ungelesen", async () => {
  const { ctx, st } = fixture();
  const app = await createApp(ctx);
  await app.request(`/agents/daily/runs/${R1}`, undefined, { ip: "127.0.0.1" });
  let v = between(await (await app.request("/agents/daily", undefined, { ip: "127.0.0.1" })).text(), 'id="verlauf"', "</ul>");
  expect(v.match(/run-dot--unread/g)?.length).toBe(1); // R3 noch ungelesen, R2 Fehler (rot)
  await app.request(`/agents/daily/runs/${R3}`, undefined, { ip: "127.0.0.1" });
  expect(JSON.parse(readFileSync(join(st, "seen.json"), "utf8")).daily).toBe(iso(9, 6, 7, 9));
  v = between(await (await app.request("/agents/daily", undefined, { ip: "127.0.0.1" })).text(), 'id="verlauf"', "</ul>");
  expect(v).not.toContain("run-dot--unread");
  expect(v).toContain("run-dot--error");
});

test("Lesestatus: laufender Lauf ändert seen.json nicht", async () => {
  const { ctx, st } = fixture();
  const app = await createApp(ctx);
  await app.request("/agents/live/runs/20261006T090000-llllll", undefined, { ip: "127.0.0.1" });
  let seen: Record<string, string> = {};
  try { seen = JSON.parse(readFileSync(join(st, "seen.json"), "utf8")); } catch {}
  expect(seen.live).toBeUndefined();
});

test("Sidebar: blauer Punkt ungelesen, roter Punkt Fehler", async () => {
  const { ctx, st } = fixture();
  writeFileSync(join(st, "news.ignored"), "");
  mkdirSync(join(st, "news"), { recursive: true });
  writeFileSync(join(st, "news", "runs.jsonl"), JSON.stringify({ runId: "n1", slug: "news", trigger: "schedule", start: iso(9, 6, 8, 0), durationMs: 1, status: "timeout" }) + "\n");
  const app = await createApp(ctx);
  const h = await (await app.request("/", undefined, { ip: "127.0.0.1" })).text();
  const nav = between(h, 'id="nav"', "</nav>");
  const item = (slug: string) => between(nav, `href="/agents/${slug}"`, "</a>");
  expect(item("daily")).toContain("nav-dot--unread");
  expect(item("news")).toContain("nav-dot--error");
  expect(item("live")).not.toContain("nav-dot");
  await app.request(`/agents/daily/runs/${R3}`, undefined, { ip: "127.0.0.1" });
  const after = between(await (await app.request("/", undefined, { ip: "127.0.0.1" })).text(), 'id="nav"', "</nav>");
  expect(between(after, 'href="/agents/daily"', "</a>")).not.toContain("nav-dot--unread");
});

test("buildCards: unread aus seen.json", () => {
  const { st } = fixture();
  const a = parseAgent("---\nname: D\ncron: '0 7 * * *'\ncwd: /x\n---\nP", "daily");
  expect(buildCards([a], st, new Map(), now)[0].unread).toBe(true);
  writeFileSync(join(st, "seen.json"), JSON.stringify({ daily: iso(9, 6, 7, 9) }));
  expect(buildCards([a], st, new Map(), now)[0].unread).toBe(false);
});

test("readRunDetail: Ergebnis und Werkzeugaufrufe, fehlende Datei leer", () => {
  const { st } = fixture();
  const d = readRunDetail(st, "daily", R3);
  expect(d.result).toContain("## Briefing");
  expect(d.tools.map((t) => t.name)).toEqual(["Read", "Bash", "Custom"]);
  expect(d.tools[1].input).toBe("ls -la");
  expect(d.tools[2].input).toContain('"a":1');
  expect(readRunDetail(st, "daily", R2)).toEqual({ result: undefined, tools: [] });
});
