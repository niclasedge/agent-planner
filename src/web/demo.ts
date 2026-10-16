import { loadAgents } from "../agent";
import { cronToOnCalendar } from "../cron";
import type { NextRuns } from "./next-run";

/** Nur für den Demo-Bestand (AGENT_PLANNER_DEMO=1): nächster Lauf aus dem Zeitplan statt aus systemd-Timern. */
export function demoNextRuns(dir: string): NextRuns {
  return async () => {
    const out = new Map<string, Date>();
    for (const a of loadAgents(dir)) {
      if (!a.enabled) continue;
      const p = Bun.spawn(["systemd-analyze", "calendar", "--iterations=1", cronToOnCalendar(a.cron).onCalendar], { stdout: "pipe", stderr: "ignore" });
      const text = await new Response(p.stdout).text();
      // "Next elapse: Wed 2026-10-07 07:00:00 CEST" -> lokale Zeit
      const m = /Next elapse:\s+\S+\s+(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/.exec(text);
      if (m) out.set(a.slug, new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    }
    return out;
  };
}
