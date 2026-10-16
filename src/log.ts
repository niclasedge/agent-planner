import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type RunStatus = "running" | "success" | "error" | "timeout" | "stopped" | "auth_missing";
export type Trigger = "schedule" | "manual";

export interface RunRecord {
  runId: string;
  slug: string;
  trigger: Trigger;
  start: string;
  end?: string;
  durationMs?: number;
  status: RunStatus;
  costUsd?: number;
  turns?: number;
  sessionId?: string;
  error?: string;
}

export const stateBase = (env: Record<string, string | undefined> = process.env): string =>
  env.AGENT_PLANNER_STATE ?? join(env.HOME ?? homedir(), ".local/state/agent-planner");

/** Identität eines Prozesses über die PID hinaus (#9): Startzeit in Ticks seit Boot + Boot-ID. */
export interface ProcIdent {
  pidStart?: string;
  bootId?: string;
}

const readOr = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

/** Feld 22 aus /proc/<pid>/stat; comm (Feld 2) kann Leerzeichen und Klammern enthalten. */
export function procStart(pid: number): string | undefined {
  const s = readOr(`/proc/${pid}/stat`);
  if (!s) return undefined;
  return s.slice(s.lastIndexOf(")") + 2).split(" ")[19];
}

export const currentBootId = (): string | undefined => readOr("/proc/sys/kernel/random/boot_id")?.trim() || undefined;

const pidAlive = (pid: number, ident: ProcIdent = {}): boolean => {
  if (ident.bootId !== undefined && ident.bootId !== currentBootId()) return false;
  if (ident.pidStart !== undefined) return procStart(pid) === ident.pidStart;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

function newRunId(): string {
  const t = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
  return `${t}-${Math.random().toString(36).slice(2, 8)}`;
}

export class RunLog {
  readonly runId = newRunId();
  private startedAt = new Date();
  private dir: string;

  constructor(readonly slug: string, readonly trigger: Trigger, base: string = stateBase()) {
    this.dir = join(base, slug);
    // Logs enthalten komplette Agent-Ausgaben: nur für den Benutzer (#10).
    // Der Basisordner bleibt, wie er ist (kann fremd oder bewusst gesetzt sein).
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    chmodSync(this.dir, 0o700); // umask-unabhängig, zieht ältere 0755 nach
    const runs = join(this.dir, "runs.jsonl");
    if (existsSync(runs)) chmodSync(runs, 0o600);
  }

  private append(file: string, line: string) {
    appendFileSync(join(this.dir, file), line + "\n", { mode: 0o600 });
  }

  private row(r: object) {
    this.append("runs.jsonl", JSON.stringify(r));
  }

  start() {
    this.startedAt = new Date();
    this.row({
      runId: this.runId,
      slug: this.slug,
      trigger: this.trigger,
      start: this.startedAt.toISOString(),
      status: "running",
      pid: process.pid,
      pidStart: procStart(process.pid),
      bootId: currentBootId(),
    });
  }

  message(m: unknown) {
    this.append(`${this.runId}.jsonl`, JSON.stringify(m));
  }

  finish(r: Partial<Pick<RunRecord, "costUsd" | "turns" | "sessionId" | "error">> & { status: Exclude<RunStatus, "running"> }) {
    const end = new Date();
    const row: Record<string, unknown> = {
      runId: this.runId,
      slug: this.slug,
      trigger: this.trigger,
      start: this.startedAt.toISOString(),
      end: end.toISOString(),
      durationMs: end.getTime() - this.startedAt.getTime(),
      ...r,
    };
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
    this.row(row);
  }
}

export function listRuns(
  slug: string,
  base: string = stateBase(),
  isAlive: (pid: number, ident: ProcIdent) => boolean = pidAlive,
): RunRecord[] {
  const file = join(base, slug, "runs.jsonl");
  if (!existsSync(file)) return [];
  const byId = new Map<string, Record<string, any>>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, any>;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof row.runId !== "string") continue;
    byId.set(row.runId, { ...byId.get(row.runId), ...row });
  }
  const runs = [...byId.values()].map((r) => {
    if (r.status === "running" && (typeof r.pid !== "number" || !isAlive(r.pid, { pidStart: r.pidStart, bootId: r.bootId }))) r.status = "timeout";
    const { pid: _pid, pidStart: _ps, bootId: _bi, ...rest } = r;
    return rest as RunRecord;
  });
  return runs.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
}

export function lastRun(slug: string, base: string = stateBase()): RunRecord | undefined {
  return listRuns(slug, base)[0];
}
