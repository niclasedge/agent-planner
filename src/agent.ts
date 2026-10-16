import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Agent {
  slug: string;
  name: string;
  cron: string;
  cwd: string;
  model?: string;
  enabled: boolean;
  timeout: number; // Minuten
  maxTurns: number;
  maxBudgetUsd: number;
  prompt: string;
}

export const DEFAULTS = { enabled: true, timeout: 30, maxTurns: 100, maxBudgetUsd: 50 } as const;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function str(fm: Record<string, unknown>, key: string, required: boolean): string | undefined {
  const v = fm[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new Error(`Agent-Datei: Pflichtfeld "${key}" fehlt`);
    return undefined;
  }
  return String(v);
}

function num(fm: Record<string, unknown>, key: string, def: number): number {
  const v = fm[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new Error(`Agent-Datei: "${key}" muss eine positive Zahl sein`);
  }
  return v;
}

export function parseAgent(text: string, slug: string): Agent {
  if (!SLUG.test(slug)) throw new Error(`Ungültiger Slug "${slug}" (erlaubt: Buchstaben, Ziffern, _ und -)`);
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!m) throw new Error(`Agent "${slug}": Frontmatter fehlt`);
  const fm = (Bun.YAML.parse(m[1]) ?? {}) as Record<string, unknown>;
  if (typeof fm !== "object" || Array.isArray(fm)) throw new Error(`Agent "${slug}": Frontmatter ist kein Objekt`);
  const enabled = fm.enabled === undefined ? DEFAULTS.enabled : fm.enabled;
  if (typeof enabled !== "boolean") throw new Error(`Agent-Datei: "enabled" muss true oder false sein`);
  return {
    slug,
    name: str(fm, "name", true)!,
    cron: str(fm, "cron", true)!,
    cwd: str(fm, "cwd", true)!,
    model: str(fm, "model", false),
    enabled,
    timeout: num(fm, "timeout", DEFAULTS.timeout),
    maxTurns: num(fm, "maxTurns", DEFAULTS.maxTurns),
    maxBudgetUsd: num(fm, "maxBudgetUsd", DEFAULTS.maxBudgetUsd),
    prompt: (m[2] ?? "").trim(),
  };
}

export function serializeAgent(a: Agent): string {
  const q = (s: string) => JSON.stringify(s); // JSON-Strings sind gültiges YAML
  const lines = [`name: ${q(a.name)}`, `cron: ${q(a.cron)}`, `cwd: ${q(a.cwd)}`];
  if (a.model) lines.push(`model: ${q(a.model)}`);
  lines.push(
    `enabled: ${a.enabled}`,
    `timeout: ${a.timeout}`,
    `maxTurns: ${a.maxTurns}`,
    `maxBudgetUsd: ${a.maxBudgetUsd}`,
  );
  return `---\n${lines.join("\n")}\n---\n${a.prompt}\n`;
}

export function resolveDir(flag: string | undefined, env: Record<string, string | undefined>): string {
  const d = flag ?? env.AGENT_PLANNER_DIR;
  if (!d) throw new Error("Agentenordner fehlt: --dir <ordner> oder Env AGENT_PLANNER_DIR setzen");
  return d;
}

export function loadAgents(dir: string): Agent[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseAgent(readFileSync(join(dir, f), "utf8"), f.slice(0, -3)));
}

export function loadAgent(dir: string, slug: string): Agent {
  return parseAgent(readFileSync(join(dir, `${slug}.md`), "utf8"), slug);
}
