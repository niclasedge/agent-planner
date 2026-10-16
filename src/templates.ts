import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Vorlage = Agent-Datei unter `templates/`, zusätzlich `icon` und `summary`; cwd und Grenzen optional. */
export interface Template {
  slug: string;
  name: string;
  cron: string;
  prompt: string;
  icon?: string;
  summary?: string;
  cwd?: string;
  model?: string;
  timeout?: number;
  maxTurns?: number;
  maxBudgetUsd?: number;
}

export const defaultTemplatesDir = join(import.meta.dir, "../templates");
export const templatesDir = (env: Record<string, string | undefined> = process.env): string =>
  env.AGENT_PLANNER_TEMPLATES || defaultTemplatesDir;

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

function parseTemplate(text: string, slug: string): Template | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!m) return undefined;
  let fm: unknown;
  try {
    fm = Bun.YAML.parse(m[1]);
  } catch {
    return undefined;
  }
  if (!fm || typeof fm !== "object" || Array.isArray(fm)) return undefined;
  const f = fm as Record<string, unknown>;
  const s = (k: string) => (typeof f[k] === "string" && f[k] !== "" ? (f[k] as string) : undefined);
  const n = (k: string) => (typeof f[k] === "number" && (f[k] as number) > 0 ? (f[k] as number) : undefined);
  const name = s("name");
  const cron = s("cron");
  if (!name || !cron) return undefined;
  return {
    slug, name, cron, prompt: (m[2] ?? "").trim(),
    icon: s("icon"), summary: s("summary"), cwd: s("cwd"), model: s("model"),
    timeout: n("timeout"), maxTurns: n("maxTurns"), maxBudgetUsd: n("maxBudgetUsd"),
  };
}

export function loadTemplate(dir: string, slug: string): Template | undefined {
  if (!SLUG.test(slug)) return undefined;
  try {
    return parseTemplate(readFileSync(join(dir, `${slug}.md`), "utf8"), slug);
  } catch {
    return undefined;
  }
}

/** Alle lesbaren Vorlagen, nach Slug sortiert; fehlender Ordner -> []. */
export function listTemplates(dir: string): Template[] {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  return files.map((f) => loadTemplate(dir, f.slice(0, -3))).filter((t): t is Template => !!t);
}
