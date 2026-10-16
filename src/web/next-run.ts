export type NextRuns = () => Promise<Map<string, Date>>;

const UNIT = /^agent-planner@(.+)\.timer$/;

/** Wertet `systemctl --user list-timers --all --output=json` aus (`next` in µs seit Epoche). */
export function parseTimers(json: string): Map<string, Date> {
  const out = new Map<string, Date>();
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return out;
  }
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const m = UNIT.exec(String(r?.unit ?? ""));
    const next = Number(r?.next);
    if (m && Number.isFinite(next) && next > 0) out.set(m[1], new Date(next / 1000));
  }
  return out;
}

export const defaultNextRuns: NextRuns = async () => {
  try {
    const p = Bun.spawn(["systemctl", "--user", "list-timers", "--all", "--output=json"], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    await p.exited;
    return parseTimers(text);
  } catch {
    return new Map();
  }
};
