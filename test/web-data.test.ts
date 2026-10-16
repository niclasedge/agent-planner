import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent } from "../src/agent";
import { parseTimers } from "../src/web/next-run";
import { buildCards, sortCards, loadOverview, promptSnippet } from "../src/web/data";

const unit = (slug: string) => `agent-planner${"@"}${slug}.timer`;
const mk = (slug: string, o: Partial<Agent> = {}): Agent => ({
  slug, name: slug, cron: "0 7 * * *", cwd: "/home/u/proj/vault", enabled: true,
  timeout: 30, maxTurns: 100, maxBudgetUsd: 50, prompt: "Mach etwas.", ...o,
});
const now = new Date(2026, 9, 6, 12, 0);

test("parseTimers: next in µs, ohne Fremd-Timer, 0 = kein Termin", () => {
  const t = new Date(2026, 9, 7, 7, 0).getTime();
  const json = JSON.stringify([
    { unit: unit("a"), next: t * 1000, activates: "x.service" },
    { unit: unit("b"), next: 0 },
    { unit: "other.timer", next: t * 1000 },
    { unit: unit("c"), next: null },
  ]);
  const m = parseTimers(json);
  expect(m.get("a")?.getTime()).toBe(t);
  expect([...m.keys()]).toEqual(["a"]);
});

test("parseTimers: kaputtes JSON -> leer", () => {
  expect(parseTimers("kein json").size).toBe(0);
  expect(parseTimers("").size).toBe(0);
});

test("promptSnippet kürzt und normalisiert Leerraum", () => {
  expect(promptSnippet("a\n\n  b")).toBe("a b");
  expect(promptSnippet("x".repeat(500)).length).toBeLessThanOrEqual(301);
});

function state() {
  const b = mkdtempSync(join(tmpdir(), "ap-web-"));
  const put = (slug: string, rows: object[]) => {
    mkdirSync(join(b, slug), { recursive: true });
    writeFileSync(join(b, slug, "runs.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  };
  return { b, put };
}

test("buildCards: Pille, Projekt, letzter Lauf, Fehler", () => {
  const s = state();
  s.put("a", [{ runId: "1", slug: "a", trigger: "schedule", start: new Date(2026, 9, 6, 7, 9).toISOString(), durationMs: 42_000, status: "success" }]);
  s.put("b", [{ runId: "2", slug: "b", trigger: "schedule", start: new Date(2026, 9, 5, 7, 9).toISOString(), durationMs: 1000, status: "error" }]);
  const cards = buildCards([mk("a"), mk("b", { enabled: false }), mk("c", { cron: "kaputt" })], s.b, new Map(), now);
  const [a, b, c] = cards;
  expect(a.recurrence).toBe("Täglich um 07:00");
  expect(a.project).toBe("vault");
  expect(a.failed).toBe(false);
  expect(a.last?.status).toBe("success");
  expect(b.recurrence).toBe("Pausiert");
  expect(b.paused).toBe(true);
  expect(b.failed).toBe(true);
  expect(c.last).toBeUndefined();
  expect(c.recurrence).toBe("kaputt"); // nicht übersetzbar -> roher Ausdruck
});

test("sortCards: nächste Ausführung aufsteigend, ohne Timer zuletzt, dann Name", () => {
  const nx = new Map([
    ["z", new Date(2026, 9, 7, 7, 0)],
    ["y", new Date(2026, 9, 6, 16, 0)],
  ]);
  const cards = buildCards([mk("m", { name: "Mitte" }), mk("z", { name: "Zeta" }), mk("y", { name: "Ypsilon" }), mk("a", { name: "Anfang" })], "/nix", nx, now);
  expect(sortCards(cards, "next").map((c) => c.agent.slug)).toEqual(["y", "z", "a", "m"]);
  expect(sortCards(cards, "name").map((c) => c.agent.slug)).toEqual(["a", "m", "y", "z"]);
});

test("loadOverview: fehlender Ordner und kaputte Datei brechen nicht ab", async () => {
  const d = mkdtempSync(join(tmpdir(), "ap-agents-"));
  writeFileSync(join(d, "ok.md"), "---\nname: Ok\ncron: '0 7 * * *'\ncwd: /x\n---\nHi\n");
  writeFileSync(join(d, "bad.md"), "kein frontmatter");
  const o = await loadOverview({ agentDir: d, stateDir: d, nextRuns: async () => new Map(), now: () => now });
  expect(o.cards.map((c) => c.agent.slug)).toEqual(["ok"]);
  expect(o.errors.length).toBe(1);
  const none = await loadOverview({ agentDir: join(d, "fehlt"), stateDir: d, nextRuns: async () => new Map(), now: () => now });
  expect(none.cards).toEqual([]);
});
