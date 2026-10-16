import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../../src/agent";
import { createApp } from "../../src/web/app";
import type { Ctx } from "../../src/web/ctx";
import { templateSection } from "../../src/web/routes/overview";
import type { Template } from "../../src/templates";

const repoTemplates = join(import.meta.dir, "../../templates");

/** Eigenes, minimales Lesen (unabhängig von src/templates.ts aus #5). */
function readTemplates(dir: string): Template[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), "utf8");
      const slug = f.slice(0, -3);
      const a = parseAgent(text, slug);
      const fm = Bun.YAML.parse(/^---\n([\s\S]*?)\n---/.exec(text)![1]) as Record<string, unknown>;
      return { slug, name: a.name, cron: a.cron, prompt: a.prompt, icon: fm.icon as string, summary: fm.summary as string };
    });
}

test("vier Vorlagen, gültig als Agent-Datei, mit icon und summary", () => {
  const list = readTemplates(repoTemplates);
  expect(list.map((t) => t.slug)).toEqual(["ai-news", "claude-code-news", "repo-lage", "wochenrueckblick"]);
  for (const t of list) {
    expect(t.icon?.length).toBeGreaterThan(0);
    expect(t.summary?.length).toBeGreaterThan(0);
    expect(t.summary!.length).toBeLessThanOrEqual(80); // Einzeiler
    expect(t.prompt.length).toBeGreaterThan(80);
  }
  const cron = Object.fromEntries(list.map((t) => [t.slug, t.cron]));
  expect(cron).toEqual({
    "claude-code-news": "0 7 * * *",
    wochenrueckblick: "0 16 * * 5",
    "repo-lage": "0 8 * * 1-5",
    "ai-news": "0 9 * * *",
  });
});

test("Vorlagen: Prompts nennen Vault, Calendar/, gh und 14 Tage", () => {
  const p = Object.fromEntries(readTemplates(repoTemplates).map((t) => [t.slug, t.prompt]));
  expect(p["claude-code-news"]).toContain("14 Tage");
  expect(p.wochenrueckblick).toContain("Calendar/");
  expect(p["repo-lage"]).toContain("gh ");
  expect(p["repo-lage"]).toContain("~/git");
  expect(p["ai-news"]).toMatch(/fort/);
});

const sample: Template[] = [
  { slug: "wochenrueckblick", name: "Wochenrückblick", cron: "0 16 * * 5", prompt: "x", icon: "◷", summary: "Woche <b>zusammenfassen</b>" },
  { slug: "repo-lage", name: "Repo-Lage", cron: "0 8 * * 1-5", prompt: "y" },
];

test("templateSection: Wellenlinie, Titel, Einzeiler, Lesbarform, Link", () => {
  const h = String(templateSection(sample));
  expect(h).toContain('class="wave"');
  expect(h).toContain("Mit einer Vorlage beginnen");
  expect(h).toContain('href="/agents/new?template=wochenrueckblick"');
  expect(h).toContain('href="/agents/new?template=repo-lage"');
  expect(h).toContain("Wochenrückblick");
  expect(h).toContain("Jeden Freitag um 16:00");
  expect(h).toContain("Wochentags um 08:00");
  expect(h).toContain("◷");
  expect(h).toContain("Woche &lt;b&gt;zusammenfassen&lt;/b&gt;");
});

test("templateSection: leer -> nichts", () => {
  expect(String(templateSection([]))).toBe("");
});

// App-Ebene: Vorlagenordner wie in /agents/new (#5): ctx.templatesDir, sonst AGENT_PLANNER_TEMPLATES, sonst <repo>/templates
const envBefore = process.env.AGENT_PLANNER_TEMPLATES;
afterEach(() => {
  if (envBefore === undefined) delete process.env.AGENT_PLANNER_TEMPLATES;
  else process.env.AGENT_PLANNER_TEMPLATES = envBefore;
});

function ctx(extra: Record<string, unknown> = {}): Ctx {
  const d = mkdtempSync(join(tmpdir(), "ap-tpl-"));
  mkdirSync(join(d, "agents"));
  writeFileSync(join(d, "agents", "a.md"), `---\nname: A\ncron: "0 7 * * *"\ncwd: /tmp\n---\nPrompt`);
  return { agentDir: join(d, "agents"), stateDir: join(d, "state"), now: () => new Date(2026, 9, 6, 12), nextRuns: async () => new Map(), ...extra } as Ctx;
}

test("GET / ohne Einstellung zeigt die Vorlagen aus <repo>/templates", async () => {
  delete process.env.AGENT_PLANNER_TEMPLATES;
  const app = await createApp(ctx());
  const h = await (await app.request("/", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain("Mit einer Vorlage beginnen");
  for (const t of readTemplates(repoTemplates)) expect(h).toContain(`href="/agents/new?template=${t.slug}"`);
  expect(h.indexOf('id="cards"')).toBeLessThan(h.indexOf("Mit einer Vorlage beginnen"));
  expect(h).toContain("/css/templates.css");
});

test("Review #6: AGENT_PLANNER_TEMPLATES gilt für Übersicht und /agents/new gleich", async () => {
  const d = mkdtempSync(join(tmpdir(), "ap-tpl-env-"));
  writeFileSync(join(d, "eigene.md"), `---\nname: "Eigene Vorlage"\ncron: "0 6 * * *"\ncwd: /tmp\nicon: "*"\nsummary: "Nur hier"\n---\nTu etwas Eigenes.`);
  process.env.AGENT_PLANNER_TEMPLATES = d;
  const app = await createApp(ctx());
  const overview = await (await app.request("/", undefined, { ip: "127.0.0.1" })).text();
  expect(overview).toContain('href="/agents/new?template=eigene"');
  expect(overview).not.toContain("template=claude-code-news");
  const res = await app.request("/agents/new?template=eigene", undefined, { ip: "127.0.0.1" });
  expect(res.status).toBe(200);
  const form = await res.text();
  expect(form).toContain("Eigene Vorlage");
  expect(form).not.toContain("nicht gefunden");
});

test("ctx.templatesDir hat Vorrang (wie in /agents/new)", async () => {
  const d = mkdtempSync(join(tmpdir(), "ap-tpl-ctx-"));
  writeFileSync(join(d, "x.md"), `---\nname: "X"\ncron: "0 6 * * *"\n---\nP`);
  process.env.AGENT_PLANNER_TEMPLATES = repoTemplates;
  const app = await createApp(ctx({ templatesDir: d }));
  const h = await (await app.request("/", undefined, { ip: "127.0.0.1" })).text();
  expect(h).toContain('href="/agents/new?template=x"');
  expect(h).not.toContain("template=repo-lage");
});

test("GET /: Vorlagenordner fehlt -> Übersicht ohne Abschnitt", async () => {
  process.env.AGENT_PLANNER_TEMPLATES = join(tmpdir(), "gibt-es-nicht-tpl-xyz");
  const app = await createApp(ctx());
  const res = await app.request("/", undefined, { ip: "127.0.0.1" });
  expect(res.status).toBe(200);
  const h = await res.text();
  expect(h).toContain("Geplante Aufgaben");
  expect(h).not.toContain("Mit einer Vorlage beginnen");
});

test("htmx-Fragment enthält keinen Vorlagen-Abschnitt", async () => {
  delete process.env.AGENT_PLANNER_TEMPLATES;
  const app = await createApp(ctx());
  const h = await (await app.request("/?sort=name", { headers: { "HX-Request": "true" } }, { ip: "127.0.0.1" })).text();
  expect(h).not.toContain("Mit einer Vorlage beginnen");
});
