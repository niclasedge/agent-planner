import { stateBase } from "../log";
import { defaultNextRuns, type NextRuns } from "./next-run";

/** Gemeinsamer Kontext für alle Routenmodule. Alles Externe ist hier injizierbar. */
export interface Ctx {
  agentDir: string;
  stateDir: string;
  /** Slug -> nächster Lauf; Slugs ohne Timer fehlen. */
  nextRuns: NextRuns;
  now: () => Date;
}

export function defaultCtx(env: Record<string, string | undefined> = process.env): Ctx {
  const agentDir = env.AGENT_PLANNER_DIR;
  if (!agentDir) throw new Error("Agentenordner fehlt: Env AGENT_PLANNER_DIR setzen");
  return { agentDir, stateDir: stateBase(env), nextRuns: defaultNextRuns, now: () => new Date() };
}
