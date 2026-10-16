import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseAgent, type Agent } from "../agent";
import { cronToOnCalendar } from "../cron";
import { listRuns, type RunRecord } from "../log";
import type { Ctx } from "./ctx";
import { isUnread, readSeen } from "./seen";

export type Sort = "next" | "name";

export interface AgentCard {
  agent: Agent;
  paused: boolean;
  /** Pillentext: lesbare Wiederholung oder "Pausiert". */
  recurrence: string;
  project: string;
  last?: RunRecord;
  /** Letzter Lauf war kein Erfolg (error, timeout, auth_missing). */
  failed: boolean;
  /** Mindestens ein beendeter Lauf ist jünger als die Marke in seen.json. */
  unread: boolean;
  next?: Date;
}

export function promptSnippet(prompt: string, max = 300): string {
  const s = prompt.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

function recurrence(a: Agent): string {
  if (!a.enabled) return "Pausiert";
  try {
    return cronToOnCalendar(a.cron).human;
  } catch {
    return a.cron;
  }
}

export const STATUS_LABEL: Record<string, string> = {
  running: "Läuft",
  success: "Erfolgreich",
  error: "Fehler",
  timeout: "Zeitüberschreitung",
  stopped: "Gestoppt",
  auth_missing: "Anmeldung fehlt",
};

export const FAILED: readonly string[] = ["error", "timeout", "auth_missing"];
export const isFailed = (r: Pick<RunRecord, "status">) => FAILED.includes(r.status);

export function buildCards(agents: Agent[], stateDir: string, next: Map<string, Date>, _now: Date): AgentCard[] {
  const seen = readSeen(stateDir);
  return agents.map((agent) => {
    const runs = listRuns(agent.slug, stateDir);
    const last = runs[0];
    return {
      agent,
      paused: !agent.enabled,
      recurrence: recurrence(agent),
      project: basename(agent.cwd.replace(/\/+$/, "")) || agent.cwd,
      last,
      failed: !!last && isFailed(last),
      unread: runs.some((r) => isUnread(r, seen[agent.slug])),
      next: next.get(agent.slug),
    };
  });
}

const byName = (a: AgentCard, b: AgentCard) => a.agent.name.localeCompare(b.agent.name, "de");

export function sortCards(cards: AgentCard[], sort: Sort): AgentCard[] {
  const c = [...cards];
  if (sort === "name") return c.sort(byName);
  return c.sort((a, b) => {
    if (a.next && b.next) return a.next.getTime() - b.next.getTime() || byName(a, b);
    if (a.next) return -1;
    if (b.next) return 1;
    return byName(a, b);
  });
}

export async function loadOverview(ctx: Ctx): Promise<{ cards: AgentCard[]; errors: string[] }> {
  const agents: Agent[] = [];
  const errors: string[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(ctx.agentDir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    // Ordner fehlt: leerer Bestand
  }
  for (const f of files) {
    try {
      agents.push(parseAgent(readFileSync(join(ctx.agentDir, f), "utf8"), f.slice(0, -3)));
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
    }
  }
  const next = await ctx.nextRuns();
  return { cards: buildCards(agents, ctx.stateDir, next, ctx.now()), errors };
}

export interface ToolCall {
  name: string;
  /** Kurzform des Inputs, eine Zeile. */
  input: string;
}

const INPUT_KEYS = ["command", "file_path", "path", "pattern", "url", "query", "prompt", "description"];

export function shortInput(input: unknown, max = 160): string {
  let s = "";
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const o = input as Record<string, unknown>;
    const k = INPUT_KEYS.find((k) => typeof o[k] === "string" && o[k] !== "");
    s = k ? String(o[k]) : JSON.stringify(o);
  } else if (input !== undefined) {
    s = typeof input === "string" ? input : JSON.stringify(input);
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

/** Liest `<runId>.jsonl`: Text der Result-Nachricht und alle tool_use-Blöcke der Assistant-Nachrichten. */
export function readRunDetail(stateDir: string, slug: string, runId: string): { result?: string; tools: ToolCall[] } {
  const f = join(stateDir, slug, `${runId}.jsonl`);
  const out: { result?: string; tools: ToolCall[] } = { result: undefined, tools: [] };
  if (!existsSync(f)) return out;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let m: any;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (m?.type === "result" && typeof m.result === "string") out.result = m.result;
    if (m?.type === "assistant" && Array.isArray(m.message?.content)) {
      for (const b of m.message.content) {
        if (b?.type === "tool_use") out.tools.push({ name: String(b.name ?? "?"), input: shortInput(b.input) });
      }
    }
  }
  return out;
}
