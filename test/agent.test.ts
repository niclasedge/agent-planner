import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent, serializeAgent, loadAgents, resolveDir } from "../src/agent";

const minimal = `---
name: Morgen
cron: "0 8 * * 1-5"
cwd: /tmp/x
---
Fasse die Lage zusammen.
`;

test("Vorgaben", () => {
  const a = parseAgent(minimal, "morgen");
  expect(a.slug).toBe("morgen");
  expect(a.enabled).toBe(true);
  expect(a.timeout).toBe(30);
  expect(a.maxTurns).toBe(100);
  expect(a.maxBudgetUsd).toBe(50);
  expect(a.model).toBeUndefined();
  expect(a.prompt).toBe("Fasse die Lage zusammen.");
});

test("Pflichtfeld cron fehlt nennt das Feld", () => {
  expect(() => parseAgent("---\nname: a\ncwd: /x\n---\nhi", "a")).toThrow(/cron/);
});

test("ohne Frontmatter ist ein Fehler", () => {
  expect(() => parseAgent("nur text", "a")).toThrow(/Frontmatter/);
});

test("Roundtrip", () => {
  const a = parseAgent(minimal, "morgen");
  const b = parseAgent(
    serializeAgent({ ...a, model: "haiku", enabled: false, timeout: 5, maxTurns: 3, maxBudgetUsd: 1.5 }),
    "morgen",
  );
  expect(b).toEqual({ ...a, model: "haiku", enabled: false, timeout: 5, maxTurns: 3, maxBudgetUsd: 1.5 });
});

test("Roundtrip mit Sonderzeichen im Namen und mehrzeiligem Prompt", () => {
  const a = parseAgent(minimal, "x");
  a.name = 'Tag: "wichtig" #1';
  a.prompt = "Zeile 1\n\n---\nZeile 3";
  expect(parseAgent(serializeAgent(a), "x")).toEqual(a);
});

test("resolveDir: Flag vor Env, sonst Fehler", () => {
  expect(resolveDir("/a", { AGENT_PLANNER_DIR: "/b" })).toBe("/a");
  expect(resolveDir(undefined, { AGENT_PLANNER_DIR: "/b" })).toBe("/b");
  expect(() => resolveDir(undefined, {})).toThrow(/AGENT_PLANNER_DIR/);
});

test("loadAgents liest alle .md, Slug aus Dateiname", () => {
  const d = mkdtempSync(join(tmpdir(), "ap-"));
  writeFileSync(join(d, "eins.md"), minimal);
  writeFileSync(join(d, "zwei.md"), minimal);
  writeFileSync(join(d, "notiz.txt"), "x");
  expect(loadAgents(d).map((a) => a.slug).sort()).toEqual(["eins", "zwei"]);
});

test("timeout muss > 0 sein", () => {
  expect(() => parseAgent(minimal.replace("cwd: /tmp/x", "cwd: /tmp/x\ntimeout: 0"), "a")).toThrow(/timeout/);
});
