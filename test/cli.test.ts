import { test, expect } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableBunPath } from "../src/units";

const run = (...a: string[]) =>
  Bun.spawnSync([process.execPath, "bin/agent-planner", ...a], { stdout: "pipe", stderr: "pipe" });

test("validate-cron: gültig -> Exit 0 mit OnCalendar", () => {
  const r = run("validate-cron", "0 8 * * 1-5");
  expect(r.exitCode).toBe(0);
  expect(r.stdout.toString()).toContain("Mon..Fri *-*-* 08:00:00");
});

test("validate-cron: ungültig -> Exit != 0", () => {
  expect(run("validate-cron", "0 8 * *").exitCode).not.toBe(0);
});

// #8: sync mit Sonderzeichen im Agentenordner; HOME und systemctl liegen in tmp, die echten Units bleiben unberührt
test("#8: sync quotet den Agentenordner, die Unit besteht systemd-analyze verify", () => {
  const home = mkdtempSync(join(tmpdir(), "ap-cli-home-"));
  const fake = join(home, "fakebin");
  mkdirSync(fake);
  writeFileSync(join(fake, "systemctl"), '#!/bin/sh\necho "$@" >> "$HOME/systemctl.log"\n');
  chmodSync(join(fake, "systemctl"), 0o755);
  const agents = join(home, "ag ent %x $y");
  mkdirSync(agents);
  writeFileSync(join(agents, "a.md"), `---\nname: a\ncron: "0 8 * * 1-5"\ncwd: /tmp\n---\nhi`);
  const r = Bun.spawnSync([process.execPath, "bin/agent-planner", "sync", "--dir", agents], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: home, PATH: `${fake}:${process.env.PATH}`, AGENT_PLANNER_DIR: "" },
  });
  expect(r.stderr.toString()).toBe("");
  expect(r.exitCode).toBe(0);
  const unitDir = join(home, ".config/systemd/user");
  const unit = readFileSync(join(unitDir, "agent-planner@.service"), "utf8");
  const exec = /^ExecStart=(.*)$/m.exec(unit)?.[1] ?? "";
  expect(exec.startsWith(stableBunPath(process.execPath) + " ")).toBe(true);
  expect(exec).toEndWith(` run %i --dir "${home}/ag ent %%x $$y"`);
  expect(readFileSync(join(home, "systemctl.log"), "utf8")).toContain("daemon-reload");
  const v = Bun.spawnSync(["systemd-analyze", "--user", "verify", join(unitDir, "agent-planner@a.service")], { stdout: "pipe", stderr: "pipe" });
  expect(v.stderr.toString()).toBe("");
  expect(v.exitCode).toBe(0);
});

// #19/#13: Warnungen für nie feuernde Zeitpläne auf stderr, Exit bleibt 0
test("#13 validate-cron: nie feuernder Plan -> Exit 0 mit Warnung auf stderr", () => {
  const r = run("validate-cron", "0 9 31 2 *");
  expect(r.exitCode).toBe(0);
  expect(r.stdout.toString()).toContain("*-02-31 09:00:00");
  expect(r.stderr.toString()).toMatch(/^Warnung: .*feuert nie/m);
  expect(run("validate-cron", "0 8 * * 1-5").stderr.toString()).toBe("");
});

function tmpHome() {
  const home = mkdtempSync(join(tmpdir(), "ap-cli-home-"));
  const fake = join(home, "fakebin");
  mkdirSync(fake);
  writeFileSync(join(fake, "systemctl"), '#!/bin/sh\necho "$@" >> "$HOME/systemctl.log"\n');
  writeFileSync(join(fake, "notify-send"), "#!/bin/sh\n");
  chmodSync(join(fake, "systemctl"), 0o755);
  chmodSync(join(fake, "notify-send"), 0o755);
  const agents = join(home, "agents");
  mkdirSync(agents);
  const env = { ...process.env, HOME: home, PATH: `${fake}:${process.env.PATH}`, AGENT_PLANNER_DIR: "", AGENT_PLANNER_STATE: join(home, "state") };
  return { home, agents, env };
}

test("#13 sync: Agent mit nie feuerndem Plan -> Warnung mit Slug, Exit 0", () => {
  const { agents, env } = tmpHome();
  writeFileSync(join(agents, "nie.md"), `---\nname: nie\ncron: "0 9 31 2 *"\ncwd: /tmp\n---\nhi`);
  writeFileSync(join(agents, "ok.md"), `---\nname: ok\ncron: "0 7 * * *"\ncwd: /tmp\n---\nhi`);
  const r = Bun.spawnSync([process.execPath, "bin/agent-planner", "sync", "--dir", agents], { stdout: "pipe", stderr: "pipe", env });
  expect(r.exitCode).toBe(0);
  const lines = r.stderr.toString().trim().split("\n");
  expect(lines.length).toBe(1);
  expect(lines[0]).toMatch(/^Warnung: Agent "nie": .*feuert nie/);
});

// Review #9: `systemctl stop` (Status stopped) ist kein Fehler der Unit -> Exit 0; error/timeout/auth_missing -> != 0
test("#9 run: auth_missing -> Exit != 0", () => {
  const { agents, env } = tmpHome();
  writeFileSync(join(agents, "a.md"), `---\nname: a\ncron: "0 7 * * *"\ncwd: /tmp\n---\nhi`);
  const e: Record<string, string | undefined> = { ...env };
  delete e.ANTHROPIC_BASE_URL;
  delete e.ANTHROPIC_AUTH_TOKEN;
  const r = Bun.spawnSync([process.execPath, "bin/agent-planner", "run", "a", "--dir", agents], { stdout: "pipe", stderr: "pipe", env: e });
  expect(r.stdout.toString()).toContain("auth_missing");
  expect(r.exitCode).not.toBe(0);
});

test("#9 run: per SIGTERM gestoppt (stopped) -> Exit 0", async () => {
  const { home, agents, env } = tmpHome();
  writeFileSync(join(agents, "a.md"), `---\nname: a\ncron: "0 7 * * *"\ncwd: ${home}\n---\nhi`);
  // Platzhalter, kein Secret: Port 9 ist zu, das SDK hängt in Wiederholungen, bis SIGTERM kommt
  const e = { ...env, ANTHROPIC_BASE_URL: "http://127.0.0.1:9", ANTHROPIC_AUTH_TOKEN: "placeholder" };
  const p = Bun.spawn([process.execPath, "bin/agent-planner", "run", "a", "--dir", agents], { stdout: "pipe", stderr: "pipe", env: e });
  const index = join(home, "state", "a", "runs.jsonl");
  for (let i = 0; i < 100 && !existsSync(index); i++) await Bun.sleep(50);
  await Bun.sleep(300); // SIGTERM-Handler hängt nach der Startzeile
  p.kill("SIGTERM");
  const code = await p.exited;
  expect(await new Response(p.stdout).text()).toContain("stopped");
  expect(code).toBe(0);
}, 20_000);
