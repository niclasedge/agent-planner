import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Agent } from "./agent";
import { cronToOnCalendar, validateOnCalendar } from "./cron";

export type Systemctl = (args: string[]) => Promise<void>;

export interface SyncOptions {
  unitDir?: string;
  systemctl?: Systemctl;
  /** Kommando vor `run %i` als Wortliste, z. B. `[bun, skript]`; jedes Element ist genau ein Wort (#18). */
  runnerPath: string[];
  /** Ordner mit `bun`, kommt in den PATH des Dienstes (das SDK startet `bun`). */
  bunDir?: string;
  /** Agentenordner, wird als --dir in ExecStart eingetragen (systemd kennt die Shell-Env nicht). */
  agentDir?: string;
  /** Units von Slugs ohne Agent entfernen (#7). Vorgabe: an; Einzel-Sync aus dem Web: aus. */
  prune?: boolean;
  /** Ordner-Schutz übersteuern (CLI `sync --force`). */
  force?: boolean;
}

export const defaultUnitDir = () => join(homedir(), ".config/systemd/user");

export const defaultSystemctl: Systemctl = async (args) => {
  const p = Bun.spawn(["systemctl", "--user", ...args], { stdout: "pipe", stderr: "pipe" });
  const code = await p.exited;
  if (code !== 0) {
    const err = await new Response(p.stderr).text();
    throw new Error(`systemctl --user ${args.join(" ")} schlug fehl (${code}): ${err.trim()}`);
  }
};

/** `AGENT_PLANNER_SYSTEMCTL` ersetzt das Kommando (Demo/Screenshots), aufgerufen als `<cmd> --user …`. */
export function systemctlFromEnv(env: Record<string, string | undefined> = process.env): Systemctl {
  const cmd = env.AGENT_PLANNER_SYSTEMCTL;
  if (!cmd) return defaultSystemctl;
  return async (args) => {
    const p = Bun.spawn([cmd, "--user", ...args], { stdout: "ignore", stderr: "pipe" });
    const code = await p.exited;
    if (code !== 0) {
      const err = await new Response(p.stderr).text();
      throw new Error(`${cmd} --user ${args.join(" ")} schlug fehl (${code}): ${err.trim()}`);
    }
  };
}

const UNIT_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const timerName = (slug: string) => `agent-planner@${slug}.timer`;

function deleteUnitFiles(unitDir: string, slug: string) {
  rmSync(join(unitDir, timerName(slug)), { force: true });
  rmSync(join(unitDir, `agent-planner@${slug}.service.d`), { recursive: true, force: true });
}

async function disableQuietly(systemctl: Systemctl, slug: string) {
  try {
    await systemctl(["disable", "--now", timerName(slug)]);
  } catch {
    // Timer war nicht geladen: Dateien trotzdem entfernen
  }
}

/** Slugs, für die ein Timer im Unit-Ordner liegt. */
function timerSlugs(unitDir: string): string[] {
  let files: string[] = [];
  try {
    files = readdirSync(unitDir);
  } catch {
    return [];
  }
  return files
    .map((f) => /^agent-planner@(.+)\.timer$/.exec(f)?.[1])
    .filter((s): s is string => !!s && UNIT_SLUG.test(s));
}

/** Timer abschalten, Timer-Datei und Drop-in löschen, daemon-reload (Archivieren, #7). */
export async function removeUnits(slug: string, opts: { unitDir?: string; systemctl?: Systemctl }): Promise<void> {
  if (!UNIT_SLUG.test(slug)) throw new Error(`Ungültiger Slug "${slug}"`);
  const unitDir = opts.unitDir ?? defaultUnitDir();
  const systemctl = opts.systemctl ?? defaultSystemctl;
  await disableQuietly(systemctl, slug);
  deleteUnitFiles(unitDir, slug);
  await systemctl(["daemon-reload"]);
}

// #8: systemd-Regeln für Unit-Dateien. Specifier (%) löst systemd in jedem Wort auf, Variablen ($)
// nur in Argumenten von ExecStart — im Programm und in Environment= bleibt `$` wörtlich.
function quoteWord(s: string): string {
  if (/[\x00-\x1f\x7f]/.test(s)) throw new Error(`Pfad mit Steuerzeichen: ${JSON.stringify(s)}`);
  return s === "" || /[\s"'\\]/.test(s) ? `"${s.replace(/[\\"]/g, "\\$&")}"` : s;
}
const escapeSpecifiers = (s: string) => s.replaceAll("%", "%%");
const execArg = (s: string) => quoteWord(escapeSpecifiers(s).replaceAll("$", "$$$$"));
const execProgram = (s: string) => quoteWord(escapeSpecifiers(s));

/**
 * mise legt je bun-Version einen Ordner an und zieht `latest` nach. Zeigt `latest` auf denselben bun,
 * gilt der latest-Pfad (übersteht bun-Updates, wie die Web-Unit); sonst bleibt der Pfad.
 */
export function stableBunPath(bunPath: string): string {
  const m = /^(.*\/installs\/bun)\/[^/]+(\/bin\/bun)$/.exec(bunPath);
  if (!m) return bunPath;
  const latest = `${m[1]}/latest${m[2]}`;
  try {
    return realpathSync(latest) === realpathSync(bunPath) ? latest : bunPath;
  } catch {
    return bunPath;
  }
}

export function serviceTemplate(runner: string[], bunDir?: string, agentDir?: string): string {
  const [program, ...args] = runner;
  const path = [bunDir && escapeSpecifiers(bunDir), "%h/.local/bin", "/usr/local/bin", "/usr/bin"].filter(Boolean).join(":");
  const words = [execProgram(program), ...args.map(execArg), "run", "%i"];
  if (agentDir) words.push("--dir", execArg(agentDir));
  return `[Unit]
Description=agent-planner Agent %i

[Service]
Type=oneshot
Environment=${quoteWord(`PATH=${path}`)}
ExecStart=${words.join(" ")}
`;
}

export function timerUnit(a: Agent): string {
  const { onCalendar } = cronToOnCalendar(a.cron);
  return `[Unit]
Description=agent-planner Zeitplan ${a.slug}

[Timer]
OnCalendar=${onCalendar}
Persistent=true

[Install]
WantedBy=timers.target
`;
}

/** Puffer der systemd-Grenze über dem Runner-Limit: der Runner bricht zuerst selbst ab (#18). */
export const SYSTEMD_GRACE_SEC = 60;

/**
 * #18: Bei Type=oneshot ignoriert systemd `RuntimeMaxSec=`; die Laufzeitgrenze ist das Start-Timeout
 * (SIGTERM, nach `TimeoutStopSec` SIGKILL). Limit mindestens 1 s, denn 0 hieße unbegrenzt.
 */
export function limitsConf(a: Agent): string {
  return `[Service]
TimeoutStartSec=${Math.max(1, Math.round(a.timeout * 60)) + SYSTEMD_GRACE_SEC}
`;
}

function writeIfChanged(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

export async function syncUnits(
  agents: Agent[],
  opts: SyncOptions,
): Promise<{ changed: string[]; templateChanged: boolean }> {
  const unitDir = opts.unitDir ?? defaultUnitDir();
  const systemctl = opts.systemctl ?? defaultSystemctl;

  // erst alles prüfen, dann schreiben: ein kaputter Agent lässt die anderen unberührt
  for (const a of agents) {
    let oc: string;
    try {
      oc = cronToOnCalendar(a.cron).onCalendar;
    } catch (e) {
      throw new Error(`Agent "${a.slug}": ${(e as Error).message}`);
    }
    if (!(await validateOnCalendar(oc))) throw new Error(`Agent "${a.slug}": systemd-analyze lehnt "${oc}" ab`);
  }

  // Template und Aufräumen gehören zu genau einem Agentenordner: ein sync mit fremdem --dir bricht ab
  const templatePath = join(unitDir, "agent-planner@.service");
  if (existsSync(templatePath) && !opts.force) {
    const m = /^ExecStart=.* run %i(?: --dir (.+))?$/m.exec(readFileSync(templatePath, "utf8"));
    const current = m?.[1];
    if (current !== (opts.agentDir === undefined ? undefined : execArg(opts.agentDir))) {
      throw new Error(
        `Die Units gehören zum Agentenordner "${current ?? "(ohne --dir)"}", nicht zu "${opts.agentDir ?? "(ohne --dir)"}". ` +
          "Abbruch, damit keine Timer anderer Agenten entfernt werden; mit --force übersteuern.",
      );
    }
  }

  // #8: CLI und Web-Sync tragen denselben, update-festen bun-Pfad ein
  const [program, ...rest] = opts.runnerPath;
  const runner = [stableBunPath(program), ...rest];
  const bunDir = opts.bunDir && dirname(stableBunPath(join(opts.bunDir, "bun")));
  const templateChanged = writeIfChanged(templatePath, serviceTemplate(runner, bunDir, opts.agentDir));
  const changed: string[] = [];
  for (const a of agents) {
    const t = writeIfChanged(join(unitDir, `agent-planner@${a.slug}.timer`), timerUnit(a));
    const l = writeIfChanged(join(unitDir, `agent-planner@${a.slug}.service.d`, "limits.conf"), limitsConf(a));
    if (t || l) changed.push(a.slug);
  }
  // #7: Units von Agenten ohne Datei (archiviert/gelöscht) entfernen
  const known = new Set(agents.map((a) => a.slug));
  const orphans = opts.prune === false ? [] : timerSlugs(unitDir).filter((s) => !known.has(s));
  for (const slug of orphans) {
    await disableQuietly(systemctl, slug);
    deleteUnitFiles(unitDir, slug);
  }
  if (templateChanged || changed.length || orphans.length) await systemctl(["daemon-reload"]);
  for (const a of agents) {
    const timer = `agent-planner@${a.slug}.timer`;
    if (a.enabled) await systemctl(["enable", "--now", timer]);
    else await systemctl(["disable", "--now", timer]);
  }
  return { changed, templateChanged };
}
