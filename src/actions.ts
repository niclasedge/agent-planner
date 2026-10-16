import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DEFAULTS, loadAgent, serializeAgent, type Agent } from "./agent";
import { cronToOnCalendar, validateOnCalendar } from "./cron";
import { defaultUnitDir, removeUnits, syncUnits, systemctlFromEnv, type Systemctl } from "./units";
import type { Ctx } from "./web/ctx";

/** Optionale Erweiterungen des Web-Ctx für Bearbeiten (#5); fehlt ein Feld, gilt die Env-Vorgabe. */
export interface EditCtx extends Ctx {
  unitDir?: string;
  systemctl?: Systemctl;
  runnerPath?: string[];
  bunDir?: string;
  templatesDir?: string;
  defaultCwd?: string;
  port?: number;
}

export interface ActionDeps {
  agentDir: string;
  stateDir: string;
  unitDir: string;
  systemctl: Systemctl;
  /** Kommando vor `run %i` als Wortliste (#18). */
  runnerPath: string[];
  bunDir?: string;
}

const repoRoot = join(import.meta.dir, "..");

/**
 * Unit-Ordner, systemctl und Runner aus Ctx, sonst Env.
 * Demo (`AGENT_PLANNER_DEMO`) ohne `AGENT_PLANNER_UNIT_DIR`: tmp-Ordner + No-op, echte Units bleiben unberührt.
 */
export function unitDeps(ctx: EditCtx, env: Record<string, string | undefined> = process.env): ActionDeps {
  const demo = !!env.AGENT_PLANNER_DEMO && !env.AGENT_PLANNER_UNIT_DIR;
  const noop: Systemctl = async () => {};
  return {
    agentDir: resolve(ctx.agentDir),
    stateDir: ctx.stateDir,
    unitDir: ctx.unitDir ?? env.AGENT_PLANNER_UNIT_DIR ?? (demo ? join(tmpdir(), "agent-planner-demo-units") : defaultUnitDir()),
    systemctl: ctx.systemctl ?? (demo && !env.AGENT_PLANNER_SYSTEMCTL ? noop : systemctlFromEnv(env)),
    runnerPath: ctx.runnerPath ?? [process.execPath, join(repoRoot, "bin/agent-planner")],
    bunDir: ctx.bunDir ?? dirname(process.execPath),
  };
}

const SAFE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Kollidieren mit Routen (`/agents/new`, `/agents/:slug/edit`); `_archiv` scheitert schon am ersten Zeichen. */
export const RESERVED = new Set(["new", "edit"]);
export const isSafeSlug = (s: string) => SAFE.test(s) && !RESERVED.has(s);

export function slugify(name: string): string {
  const map: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => map[c])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+/, "")
    .slice(0, 64)
    .replace(/[-_]+$/, "");
}

/** Pfad der Agent-Datei; wirft bei unsicherem Slug oder Ausbruch aus dem Ordner. */
export function agentPath(dir: string, slug: string): string {
  if (!isSafeSlug(slug)) throw new Error(`Ungültiger Slug "${slug}"`);
  const base = resolve(dir);
  const p = resolve(base, `${slug}.md`);
  if (dirname(p) !== base) throw new Error(`Ungültiger Slug "${slug}"`);
  return p;
}

export interface FormInput {
  name: string;
  cron: string;
  cwd: string;
  model: string;
  prompt: string;
  timeout: string;
  maxTurns: string;
  maxBudgetUsd: string;
}
export type FieldErrors = Partial<Record<keyof FormInput | "form", string>>;

export async function checkCron(expr: string): Promise<{ human?: string; error?: string }> {
  if (!expr.trim()) return { error: "Bitte einen Cron-Ausdruck angeben, z. B. 0 7 * * *" };
  try {
    const r = cronToOnCalendar(expr);
    if (!(await validateOnCalendar(r.onCalendar))) return { error: `systemd lehnt „${r.onCalendar}“ ab` };
    return { human: r.human };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function positive(raw: string, def: number, integer: boolean): number | string {
  const t = raw.trim();
  if (t === "") return def;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "Muss eine positive Zahl sein";
  if (integer && !Number.isInteger(n)) return "Muss eine ganze Zahl sein";
  return n;
}

/**
 * Prüft das Formular. `slug` gesetzt = Bearbeiten (Slug bleibt), sonst Anlegen (Slug aus dem Namen).
 * Liefert den Agenten (enabled = true; beim Bearbeiten setzt der Aufrufer den alten Wert) oder Fehler am Feld.
 */
export async function validateForm(
  input: FormInput,
  opts: { agentDir: string; slug?: string },
): Promise<{ agent?: Agent; errors: FieldErrors }> {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  let slug = opts.slug ?? "";
  if (!name) errors.name = "Bitte einen Namen angeben";
  else if (!opts.slug) {
    slug = slugify(name);
    if (!slug) errors.name = "Der Name braucht Buchstaben oder Ziffern";
    else if (RESERVED.has(slug)) errors.name = `Kürzel „${slug}“ ist reserviert, bitte anders benennen`;
    else if (existsSync(agentPath(opts.agentDir, slug))) errors.name = `Kürzel „${slug}“ ist schon vergeben`;
  }

  const cron = input.cron.trim().replace(/\s+/g, " ");
  const c = await checkCron(cron);
  if (c.error) errors.cron = c.error;

  let cwd = input.cwd.trim();
  if (cwd === "~" || cwd.startsWith("~/")) cwd = join(homedir(), cwd.slice(1));
  if (!cwd) errors.cwd = "Bitte einen Ordner angeben";
  else if (!cwd.startsWith("/")) errors.cwd = "Bitte einen absoluten Pfad angeben";
  else if (!existsSync(cwd) || !statSync(cwd).isDirectory()) errors.cwd = `Ordner ${cwd} existiert nicht`;

  const model = input.model.trim();
  if (/\s/.test(model)) errors.model = "Modellname ohne Leerzeichen";

  const prompt = input.prompt.replace(/\r\n/g, "\n").trim();
  if (!prompt) errors.prompt = "Bitte einen Prompt angeben";

  const timeout = positive(input.timeout, DEFAULTS.timeout, false);
  const maxTurns = positive(input.maxTurns, DEFAULTS.maxTurns, true);
  const maxBudgetUsd = positive(input.maxBudgetUsd, DEFAULTS.maxBudgetUsd, false);
  if (typeof timeout === "string") errors.timeout = timeout;
  if (typeof maxTurns === "string") errors.maxTurns = maxTurns;
  if (typeof maxBudgetUsd === "string") errors.maxBudgetUsd = maxBudgetUsd;

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    agent: {
      slug, name, cron, cwd, model: model || undefined, enabled: true, prompt,
      timeout: timeout as number, maxTurns: maxTurns as number, maxBudgetUsd: maxBudgetUsd as number,
    },
  };
}

const KNOWN = new Set(["name", "cron", "cwd", "model", "enabled", "timeout", "maxTurns", "maxBudgetUsd"]);

/**
 * Schreibt die Agent-Datei atomar; Frontmatter-Schlüssel, die der Planer nicht kennt (tags …), bleiben erhalten.
 * `exclusive` (Anlegen): nie überschreiben — per link(2), das bei vorhandener Datei mit EEXIST scheitert.
 */
export function writeAgentFile(dir: string, a: Agent, opts: { exclusive?: boolean } = {}): string {
  const path = agentPath(dir, a.slug);
  let extra = "";
  if (!opts.exclusive && existsSync(path)) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, "utf8"));
    let fm: unknown = null;
    try {
      fm = m ? Bun.YAML.parse(m[1]) : null;
    } catch {
      // unlesbares Frontmatter: fremde Schlüssel lassen sich nicht retten
    }
    if (fm && typeof fm === "object" && !Array.isArray(fm)) {
      extra = Object.entries(fm)
        .filter(([k]) => !KNOWN.has(k))
        .map(([k, v]) => `${/^[A-Za-z_][\w-]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)}\n`)
        .join("");
    }
  }
  const text = serializeAgent(a).replace(/\n---\n/, `\n${extra}---\n`);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${a.slug}.md.tmp-${process.pid}`);
  writeFileSync(tmp, text);
  if (!opts.exclusive) {
    renameSync(tmp, path);
    return path;
  }
  try {
    linkSync(tmp, path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Agent-Datei ${a.slug}.md existiert schon`);
    throw e;
  } finally {
    unlinkSync(tmp);
  }
  return path;
}

function existing(deps: ActionDeps, slug: string): Agent {
  agentPath(deps.agentDir, slug); // Slug-Prüfung
  return loadAgent(deps.agentDir, slug);
}

/** Units genau dieses Agenten abgleichen; andere bleiben unberührt. */
export async function syncOne(deps: ActionDeps, a: Agent): Promise<void> {
  await syncUnits([a], {
    unitDir: deps.unitDir,
    systemctl: deps.systemctl,
    runnerPath: deps.runnerPath,
    bunDir: deps.bunDir,
    agentDir: deps.agentDir,
    prune: false,
  });
}

export async function saveAgent(deps: ActionDeps, a: Agent): Promise<void> {
  writeAgentFile(deps.agentDir, a);
  await syncOne(deps, a);
}

export async function toggleAgent(deps: ActionDeps, slug: string): Promise<Agent> {
  const cur = existing(deps, slug);
  const a = { ...cur, enabled: !cur.enabled };
  await saveAgent(deps, a);
  return a;
}

/** Datei nach `_archiv/` (bei Kollision mit Zeitstempel), Timer und Drop-in weg, Logs bleiben. */
export async function archiveAgent(deps: ActionDeps, slug: string): Promise<string> {
  const from = agentPath(deps.agentDir, slug);
  if (!existsSync(from)) throw new Error(`Agent "${slug}" nicht gefunden`);
  const dir = join(deps.agentDir, "_archiv");
  mkdirSync(dir, { recursive: true });
  let to = join(dir, `${slug}.md`);
  if (existsSync(to)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
    to = join(dir, `${slug}-${stamp}.md`);
  }
  renameSync(from, to);
  await removeUnits(slug, { unitDir: deps.unitDir, systemctl: deps.systemctl });
  return to;
}

/** manual-Marker schreiben, Units sicherstellen, Dienst starten ohne zu warten. */
export async function runNow(deps: ActionDeps, slug: string): Promise<void> {
  const a = existing(deps, slug);
  await syncOne(deps, a);
  const marker = join(deps.stateDir, slug, "manual");
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, new Date().toISOString());
  try {
    await deps.systemctl(["start", "--no-block", `agent-planner@${slug}.service`]);
  } catch (e) {
    rmSync(marker, { force: true }); // sonst gälte der nächste Zeitplan-Lauf als manuell
    throw e;
  }
}
