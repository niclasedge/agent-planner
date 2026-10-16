import { test, expect } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../src/agent";
import { syncUnits, timerUnit, limitsConf, serviceTemplate, removeUnits, systemctlFromEnv, stableBunPath } from "../src/units";

const mk = (slug: string, extra = "") =>
  parseAgent(`---\nname: ${slug}\ncron: "0 8 * * 1-5"\ncwd: /tmp\n${extra}---\nhi`, slug);

test("Timer", () => {
  const t = timerUnit(mk("a"));
  expect(t).toContain("OnCalendar=Mon..Fri *-*-* 08:00:00");
  expect(t).toContain("Persistent=true");
  expect(t).toContain("WantedBy=timers.target");
});

test("#18: Limits: timeout 45 -> TimeoutStartSec 2700 s + 60 s Puffer, kein RuntimeMaxSec", () => {
  const l = limitsConf(mk("a", "timeout: 45\n"));
  expect(l).toContain("TimeoutStartSec=2760\n");
  expect(l).not.toContain("RuntimeMaxSec");
});

test("Template ruft Runner mit %i", () => {
  const s = serviceTemplate(["/opt/agent-planner/bin/agent-planner"]);
  expect(s).toContain("ExecStart=/opt/agent-planner/bin/agent-planner run %i");
  expect(s).toContain("Type=oneshot");
});

function setup() {
  const unitDir = mkdtempSync(join(tmpdir(), "ap-units-"));
  const calls: string[][] = [];
  const systemctl = async (args: string[]) => {
    calls.push(args);
  };
  return { unitDir, calls, systemctl };
}

test("sync schreibt Dateien, daemon-reload, enable --now / disable", async () => {
  const { unitDir, calls, systemctl } = setup();
  const agents = [mk("an"), mk("aus", "enabled: false\n")];
  await syncUnits(agents, { unitDir, systemctl, runnerPath: ["/r"] });
  expect(readFileSync(join(unitDir, "agent-planner@an.timer"), "utf8")).toContain("OnCalendar=");
  expect(existsSync(join(unitDir, "agent-planner@.service"))).toBe(true);
  expect(readFileSync(join(unitDir, "agent-planner@an.service.d/limits.conf"), "utf8")).toContain("TimeoutStartSec=1860");
  expect(calls[0]).toEqual(["daemon-reload"]);
  expect(calls).toContainEqual(["enable", "--now", "agent-planner@an.timer"]);
  expect(calls).toContainEqual(["disable", "--now", "agent-planner@aus.timer"]);
});

test("unverändert: kein daemon-reload", async () => {
  const { unitDir, calls, systemctl } = setup();
  const agents = [mk("an")];
  await syncUnits(agents, { unitDir, systemctl, runnerPath: ["/r"] });
  calls.length = 0;
  const r = await syncUnits(agents, { unitDir, systemctl, runnerPath: ["/r"] });
  expect(r.changed).toEqual([]);
  expect(calls.find((c) => c[0] === "daemon-reload")).toBeUndefined();
});

test("geändert: neu schreiben und reload", async () => {
  const { unitDir, calls, systemctl } = setup();
  await syncUnits([mk("an")], { unitDir, systemctl, runnerPath: ["/r"] });
  calls.length = 0;
  const r = await syncUnits([mk("an", "timeout: 5\n")], { unitDir, systemctl, runnerPath: ["/r"] });
  expect(r.changed).toEqual(["an"]);
  expect(calls[0]).toEqual(["daemon-reload"]);
});

test("ungültiger Cron bricht sync mit Agent-Namen ab", async () => {
  const { unitDir, systemctl } = setup();
  const bad = parseAgent(`---\nname: b\ncron: "0 8 1 * 1"\ncwd: /tmp\n---\nhi`, "bad");
  await expect(syncUnits([bad], { unitDir, systemctl, runnerPath: ["/r"] })).rejects.toThrow(/bad/);
});

test("sehr kleiner timeout ergibt Limit >= 1 s plus Puffer (0 hieße unbegrenzt)", () => {
  expect(limitsConf(mk("a", "timeout: 0.001\n"))).toContain("TimeoutStartSec=61\n");
});

// #7: Units verwaister Agenten aufräumen
const T = (slug: string) => "agent-planner" + "@" + slug + ".timer";
const D = (slug: string) => "agent-planner" + "@" + slug + ".service.d";

test("#7: sync entfernt Timer und Drop-in eines Agenten ohne Datei", async () => {
  const { unitDir, calls, systemctl } = setup();
  await syncUnits([mk("bleibt"), mk("alt")], { unitDir, systemctl, runnerPath: ["/r"] });
  calls.length = 0;
  await syncUnits([mk("bleibt")], { unitDir, systemctl, runnerPath: ["/r"] });
  expect(existsSync(join(unitDir, T("alt")))).toBe(false);
  expect(existsSync(join(unitDir, D("alt")))).toBe(false);
  expect(existsSync(join(unitDir, T("bleibt")))).toBe(true);
  expect(existsSync(join(unitDir, "agent-planner@.service"))).toBe(true); // Template bleibt
  expect(calls).toContainEqual(["disable", "--now", T("alt")]);
  expect(calls).toContainEqual(["daemon-reload"]);
  expect(calls.findIndex((c) => c[1] === "--now" && c[2] === T("alt"))).toBeLessThan(calls.findIndex((c) => c[0] === "daemon-reload"));
});

test("#7: prune: false lässt fremde Units stehen", async () => {
  const { unitDir, calls, systemctl } = setup();
  await syncUnits([mk("a"), mk("b")], { unitDir, systemctl, runnerPath: ["/r"] });
  calls.length = 0;
  await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: ["/r"], prune: false });
  expect(existsSync(join(unitDir, T("b")))).toBe(true);
  expect(calls.find((c) => c[2] === T("b"))).toBeUndefined();
});

test("#7: fremde Dateien im Unit-Ordner bleiben unberührt", async () => {
  const { unitDir, systemctl } = setup();
  writeFileSync(join(unitDir, "anderes.timer"), "x");
  writeFileSync(join(unitDir, "agent-planner-x.timer"), "x");
  await syncUnits([], { unitDir, systemctl, runnerPath: ["/r"] });
  expect(existsSync(join(unitDir, "anderes.timer"))).toBe(true);
  expect(existsSync(join(unitDir, "agent-planner-x.timer"))).toBe(true);
});

test("removeUnits: disable, löschen, reload; Fehler beim disable stoppt nicht", async () => {
  const { unitDir, calls } = setup();
  await syncUnits([mk("weg")], { unitDir, systemctl: async () => {}, runnerPath: ["/r"] });
  const systemctl = async (args: string[]) => {
    calls.push(args);
    if (args[0] === "disable") throw new Error("not loaded");
  };
  await removeUnits("weg", { unitDir, systemctl });
  expect(existsSync(join(unitDir, T("weg")))).toBe(false);
  expect(existsSync(join(unitDir, D("weg")))).toBe(false);
  expect(calls).toEqual([["disable", "--now", T("weg")], ["daemon-reload"]]);
});

test("removeUnits lehnt ungültige Slugs ab", async () => {
  const { unitDir, systemctl } = setup();
  await expect(removeUnits("../x", { unitDir, systemctl })).rejects.toThrow(/Slug/);
});

test("systemctlFromEnv: AGENT_PLANNER_SYSTEMCTL ersetzt das Kommando", async () => {
  const run = systemctlFromEnv({ AGENT_PLANNER_SYSTEMCTL: "true" });
  await run(["start", "x"]); // "true --user start x" -> Exit 0
  await expect(systemctlFromEnv({ AGENT_PLANNER_SYSTEMCTL: "false" })(["x"])).rejects.toThrow(/schlug fehl/);
});

// Review: Aufräumen nur, wenn das Template zum aktuellen Agentenordner gehört
test("sync mit anderem --dir als im Template: Abbruch, keine Timer entfernt", async () => {
  const { unitDir, calls, systemctl } = setup();
  await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/vault/agents" });
  calls.length = 0;
  await expect(syncUnits([], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/leer" })).rejects.toThrow(/\/vault\/agents.*--force/s);
  expect(existsSync(join(unitDir, T("a")))).toBe(true);
  expect(readFileSync(join(unitDir, "agent-planner@.service"), "utf8")).toContain("--dir /vault/agents");
  expect(calls).toEqual([]);
});

test("sync mit force übersteuert den Ordner-Schutz", async () => {
  const { unitDir, systemctl } = setup();
  await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/vault/agents" });
  await syncUnits([], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/neu", force: true });
  expect(existsSync(join(unitDir, T("a")))).toBe(false);
  expect(readFileSync(join(unitDir, "agent-planner@.service"), "utf8")).toContain("--dir /neu");
});

test("sync mit gleichem Ordner räumt auf; ohne Template kein Abbruch", async () => {
  const { unitDir, systemctl } = setup();
  await syncUnits([mk("a"), mk("b")], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/vault/agents" });
  await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/vault/agents" });
  expect(existsSync(join(unitDir, T("b")))).toBe(false);
});

// #8: Pfade nach systemd-Regeln kodieren, stabiler bun-Pfad

const execLine = (unit: string) => /^ExecStart=(.*)$/m.exec(unit)?.[1];

test("#8: Template kodiert %, $, Leerzeichen und Anführungszeichen", () => {
  const s = serviceTemplate(["/p rog/%x $y/bun", "/s/agent-planner"], "/a b/%x", '/ag "ent" %x $y\\z');
  expect(execLine(s)).toBe('"/p rog/%%x $y/bun" /s/agent-planner run %i --dir "/ag \\"ent\\" %%x $$y\\\\z"');
  expect(s).toContain('Environment="PATH=/a b/%%x:%h/.local/bin:/usr/local/bin:/usr/bin"\n');
});

test("#8: Pfade ohne Sonderzeichen bleiben wörtlich, % und $ ohne Quotes", () => {
  const s = serviceTemplate(["/b/bun", "/s/agent-planner"], "/b", "/v/100%/$x");
  expect(execLine(s)).toBe("/b/bun /s/agent-planner run %i --dir /v/100%%/$$x");
  expect(s).toContain("Environment=PATH=/b:%h/.local/bin");
});

test("#8: Steuerzeichen im Pfad: Abbruch, keine Unit", async () => {
  const { unitDir, systemctl } = setup();
  await expect(syncUnits([mk("a")], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/a\nExecStart=/x" })).rejects.toThrow(/Steuerzeichen/);
  expect(existsSync(join(unitDir, "agent-planner@.service"))).toBe(false);
});

test("#18: runnerPath ist eine Wortliste, jedes Wort einzeln kodiert, keine Teilung", () => {
  expect(execLine(serviceTemplate([process.execPath, "/a b/bin/agent-planner"]))).toEndWith(' "/a b/bin/agent-planner" run %i');
  expect(execLine(serviceTemplate([`${process.execPath} /x`]))).toBe(`"${process.execPath} /x" run %i`);
});

function fakeMise() {
  const root = mkdtempSync(join(tmpdir(), "ap-mise-"));
  const bun = (v: string) => join(root, "installs/bun", v, "bin/bun");
  for (const v of ["9.9.9", "9.9.8"]) {
    mkdirSync(join(root, "installs/bun", v, "bin"), { recursive: true });
    writeFileSync(bun(v), "#!/bin/sh\n");
    chmodSync(bun(v), 0o755);
  }
  return { root, bun };
}

test("#8: stableBunPath nimmt latest, wenn es auf dieselbe Datei zeigt", () => {
  const { root, bun } = fakeMise();
  expect(stableBunPath(bun("9.9.9"))).toBe(bun("9.9.9")); // ohne latest
  symlinkSync("./9.9.9", join(root, "installs/bun/latest"));
  expect(stableBunPath(bun("9.9.9"))).toBe(bun("latest"));
  expect(stableBunPath(bun("9.9.8"))).toBe(bun("9.9.8")); // latest zeigt woanders hin
  expect(stableBunPath("/usr/bin/bun")).toBe("/usr/bin/bun");
});

test("#8: sync schreibt den latest-Pfad in ExecStart und PATH", async () => {
  const { root, bun } = fakeMise();
  symlinkSync("./9.9.9", join(root, "installs/bun/latest"));
  const { unitDir, systemctl } = setup();
  await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: [bun("9.9.9"), "/s/agent-planner"], bunDir: join(root, "installs/bun/9.9.9/bin") });
  const s = readFileSync(join(unitDir, "agent-planner@.service"), "utf8");
  expect(execLine(s)).toStartWith(`${bun("latest")} /s/agent-planner run %i`);
  expect(s).toContain(`Environment=PATH=${join(root, "installs/bun/latest/bin")}:`);
  expect(s).not.toContain("9.9.9");
});

test("#8: Ordner-Schutz mit gequotetem --dir: gleicher Ordner ok, anderer bricht ab", async () => {
  const { unitDir, systemctl } = setup();
  await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/v a/%x" });
  const r = await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/v a/%x" });
  expect(r).toEqual({ changed: [], templateChanged: false });
  await expect(syncUnits([], { unitDir, systemctl, runnerPath: ["/r"], agentDir: "/v a" })).rejects.toThrow(/--force/);
});

test("#8: systemd-analyze verify akzeptiert die erzeugte Unit mit Leerzeichen, % und $ im Pfad", async () => {
  const base = mkdtempSync(join(tmpdir(), "ap-verify-"));
  const progDir = join(base, "p rog %x $y");
  mkdirSync(progDir);
  const prog = join(progDir, "bun");
  writeFileSync(prog, "#!/bin/sh\n");
  chmodSync(prog, 0o755);
  const { unitDir, systemctl } = setup();
  await syncUnits([mk("a")], { unitDir, systemctl, runnerPath: [prog, join(base, "s %x/agent-planner")], bunDir: progDir, agentDir: join(base, "ag ent %x $y") });
  const p = Bun.spawnSync(["systemd-analyze", "--user", "verify", join(unitDir, "agent-planner@a.service")], { stdout: "pipe", stderr: "pipe" });
  expect(p.stderr.toString()).toBe("");
  expect(p.exitCode).toBe(0);
});
