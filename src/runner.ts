import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Agent } from "./agent";
import { RunLog, stateBase, type Trigger } from "./log";

type QueryFn = (args: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<any>;
export type Notify = (title: string, body: string) => void | Promise<void>;
type Outcome = { runId: string; status: string; error?: string };

const NOTIFY_MAX = 200;
/** Marker von runNow gilt so lange ab seinem Zeitstempel (#9). */
const MARKER_TTL_MS = 60_000;
const MARKER_SKEW_MS = 5_000;
/** SIGTERM so nah am Zeitlimit gilt als Zeitüberschreitung (#9). */
const STOP_TOLERANCE_MS = 5_000;
const FAILED = new Set(["error", "timeout", "auth_missing"]);

/** Desktop-Benachrichtigung; fehlt das Programm oder scheitert es, still weiter. */
export async function notifySend(title: string, body: string, cmd = "notify-send"): Promise<void> {
  try {
    const p = Bun.spawn([cmd, "-a", "agent-planner", "--", title, body], { stdout: "ignore", stderr: "ignore" });
    await p.exited;
  } catch {
    // kein notify-send (z. B. ohne Desktop)
  }
}

const ABORT_TEXT = { timeout: "Zeitlimit erreicht", stopped: "Gestoppt (SIGTERM vor dem Zeitlimit)" } as const;

const shorten = (s: string) => (s.length > NOTIFY_MAX ? s.slice(0, NOTIFY_MAX - 1) + "…" : s);

export interface RunDeps {
  query?: QueryFn;
  env?: Record<string, string | undefined>;
  stateBase?: string;
  trigger: Trigger;
  /** Ersetzt den dynamischen SDK-Import (Tests). */
  importSdk?: () => Promise<{ query: unknown }>;
  /** Überschreibt agent.timeout (nur für Tests). */
  timeoutMs?: number;
  /** Benachrichtigung bei error/timeout/auth_missing; Vorgabe notify-send. */
  notify?: Notify;
  /** Laufzeit des Prozesses in ms (Tests); Vorgabe process.uptime(). */
  uptimeMs?: () => number;
}

/**
 * Auslöser: Flag oder Env entscheiden zuerst und lassen den Marker liegen (er gehört zu einem anderen Start).
 * Sonst zählt der Marker nur, wenn sein Zeitstempel höchstens 60 s alt ist; gelesen wird er immer gelöscht.
 */
export function detectTrigger(
  slug: string,
  o: { manualFlag?: boolean; env?: Record<string, string | undefined>; stateBase?: string; now?: number },
): Trigger {
  const env = o.env ?? process.env;
  if (o.manualFlag || env.AGENT_PLANNER_TRIGGER === "manual") return "manual";
  const marker = join(o.stateBase ?? stateBase(env), slug, "manual");
  if (!existsSync(marker)) return "schedule";
  let written = NaN;
  try {
    written = Date.parse(readFileSync(marker, "utf8").trim());
  } catch {}
  try {
    rmSync(marker, { force: true });
  } catch {}
  const age = (o.now ?? Date.now()) - written;
  return age >= -MARKER_SKEW_MS && age <= MARKER_TTL_MS ? "manual" : "schedule";
}

export async function runAgent(agent: Agent, deps: RunDeps): Promise<{ runId: string; status: string }> {
  const r = await execute(agent, deps);
  if (FAILED.has(r.status)) {
    try {
      await (deps.notify ?? notifySend)(`${agent.name}: ${r.status}`, shorten(r.error ?? r.status));
    } catch {
      // Benachrichtigung darf den Lauf nicht ändern
    }
  }
  return { runId: r.runId, status: r.status };
}

async function execute(agent: Agent, deps: RunDeps): Promise<Outcome> {
  const env = deps.env ?? process.env;
  const log = new RunLog(agent.slug, deps.trigger, deps.stateBase ?? stateBase(env));
  log.start();

  if (!env.ANTHROPIC_BASE_URL || !env.ANTHROPIC_AUTH_TOKEN) {
    const missing = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"].filter((k) => !env[k]);
    const error = `Umgebung fehlt: ${missing.join(", ")}`;
    log.finish({ status: "auth_missing", error });
    return { runId: log.runId, status: "auth_missing", error };
  }

  const ac = new AbortController();
  const limitMs = deps.timeoutMs ?? agent.timeout * 60_000;
  let aborted: "timeout" | "stopped" | undefined;
  const abort = (why: "timeout" | "stopped") => {
    aborted ??= why;
    ac.abort();
  };
  const onTimer = () => abort("timeout");
  // systemd schickt bei TimeoutStartSec (Limit + Puffer, src/units.ts) und bei `stop` dasselbe SIGTERM:
  // Ursache aus der Laufzeit (#9). Die systemd-Grenze liegt über dem Limit, zählt also immer als timeout (#18).
  const onSigterm = () => {
    const uptime = deps.uptimeMs ? deps.uptimeMs() : process.uptime() * 1000;
    abort(uptime >= limitMs - Math.min(STOP_TOLERANCE_MS, limitMs / 10) ? "timeout" : "stopped");
  };
  const timer = setTimeout(onTimer, limitMs);
  process.once("SIGTERM", onSigterm);
  try {
    const query: QueryFn =
      deps.query ?? ((await (deps.importSdk ?? (() => import("@anthropic-ai/claude-agent-sdk")))()).query as unknown as QueryFn);
    const options: Record<string, unknown> = {
      permissionMode: "auto",
      executable: "bun",
      cwd: agent.cwd,
      maxTurns: agent.maxTurns,
      maxBudgetUsd: agent.maxBudgetUsd,
      abortController: ac,
    };
    if (agent.model) options.model = agent.model;

    let result: any;
    for await (const msg of query({ prompt: agent.prompt, options })) {
      log.message(msg);
      if (msg?.type === "result") result = msg;
    }
    if (aborted) {
      const error = ABORT_TEXT[aborted];
      log.finish({ status: aborted, ...pick(result), error });
      return { runId: log.runId, status: aborted, error };
    }
    if (!result) {
      const error = "SDK beendete ohne Result-Nachricht";
      log.finish({ status: "error", error });
      return { runId: log.runId, status: "error", error };
    }
    if (result.is_error || result.subtype !== "success") {
      const err = Array.isArray(result.errors) && result.errors.length ? result.errors.join("; ") : String(result.result ?? result.subtype);
      log.finish({ status: "error", ...pick(result), error: err });
      return { runId: log.runId, status: "error", error: err };
    }
    log.finish({ status: "success", ...pick(result) });
    return { runId: log.runId, status: "success" };
  } catch (e) {
    const status = aborted ?? "error";
    const error = aborted ? ABORT_TEXT[aborted] : (e as Error).message ?? String(e);
    log.finish({ status, error });
    return { runId: log.runId, status, error };
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGTERM", onSigterm);
  }
}

function pick(r: any) {
  if (!r) return {};
  return { costUsd: r.total_cost_usd, turns: r.num_turns, sessionId: r.session_id };
}
