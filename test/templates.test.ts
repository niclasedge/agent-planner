import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listTemplates, loadTemplate, templatesDir, defaultTemplatesDir } from "../src/templates";

function dir() {
  const d = mkdtempSync(join(tmpdir(), "ap-tpl-"));
  writeFileSync(join(d, "b-news.md"), `---\nname: News\ncron: "0 9 * * *"\ncwd: /tmp\nicon: "◎"\nsummary: Neuigkeiten\nmaxTurns: 20\n---\nSuche Neues.\n`);
  writeFileSync(join(d, "a-lage.md"), `---\nname: Lage\ncron: "0 8 * * 1-5"\n---\nPrüfe die Lage.\n`);
  writeFileSync(join(d, "kaputt.md"), `kein frontmatter`);
  writeFileSync(join(d, "ohne-cron.md"), `---\nname: X\n---\nP\n`);
  writeFileSync(join(d, "notiz.txt"), "x");
  return d;
}

test("listTemplates: sortiert, nur gültige .md, mit icon/summary", () => {
  const list = listTemplates(dir());
  expect(list.map((t) => t.slug)).toEqual(["a-lage", "b-news"]);
  const n = list[1];
  expect(n).toMatchObject({ name: "News", cron: "0 9 * * *", cwd: "/tmp", icon: "◎", summary: "Neuigkeiten", maxTurns: 20, prompt: "Suche Neues." });
  expect(list[0].cwd).toBeUndefined();
});

test("listTemplates: fehlender Ordner -> leer", () => {
  expect(listTemplates(join(tmpdir(), "gibt-es-nicht-tpl"))).toEqual([]);
});

test("loadTemplate: vorhanden, fehlend, ungültiger Slug", () => {
  const d = dir();
  expect(loadTemplate(d, "b-news")?.name).toBe("News");
  expect(loadTemplate(d, "nix")).toBeUndefined();
  expect(loadTemplate(d, "../b-news")).toBeUndefined();
  expect(loadTemplate(d, "kaputt")).toBeUndefined();
});

test("templatesDir: Env überschreibt Repo-Ordner", () => {
  expect(templatesDir({})).toBe(defaultTemplatesDir);
  expect(defaultTemplatesDir.endsWith("/templates")).toBe(true);
  expect(templatesDir({ AGENT_PLANNER_TEMPLATES: "/x" })).toBe("/x");
});
