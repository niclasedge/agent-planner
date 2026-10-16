import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunLog, listRuns, lastRun, stateBase } from "../src/log";

const base = () => mkdtempSync(join(tmpdir(), "ap-state-"));

test("stateBase aus Env", () => {
  expect(stateBase({ AGENT_PLANNER_STATE: "/x" })).toBe("/x");
  expect(stateBase({ HOME: "/h" })).toBe("/h/.local/state/agent-planner");
});

test("Start und Ende: zwei Zeilen, zusammengefasst", () => {
  const b = base();
  const log = new RunLog("a", "schedule", b);
  log.start();
  log.finish({ status: "success", costUsd: 0.01, turns: 1, sessionId: "s" });
  const lines = readFileSync(join(b, "a", "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.length).toBe(2);
  expect(lines[0].status).toBe("running");
  expect(lines[0].runId).toBe(lines[1].runId);
  const runs = listRuns("a", b);
  expect(runs.length).toBe(1);
  expect(runs[0]).toMatchObject({ slug: "a", trigger: "schedule", status: "success", costUsd: 0.01, turns: 1, sessionId: "s" });
  expect(typeof runs[0].durationMs).toBe("number");
  expect(runs[0].end).toBeDefined();
});

test("Nachrichten je Zeile", () => {
  const b = base();
  const log = new RunLog("a", "manual", b);
  log.start();
  log.message({ type: "x" });
  log.message({ type: "y" });
  const f = readFileSync(join(b, "a", `${log.runId}.jsonl`), "utf8").trim().split("\n");
  expect(f.map((l) => JSON.parse(l).type)).toEqual(["x", "y"]);
});

test("neueste zuerst, lastRun", async () => {
  const b = base();
  const l1 = new RunLog("a", "schedule", b);
  l1.start(); l1.finish({ status: "success" });
  await Bun.sleep(5);
  const l2 = new RunLog("a", "manual", b);
  l2.start(); l2.finish({ status: "error", error: "kaputt" });
  expect(listRuns("a", b).map((r) => r.runId)).toEqual([l2.runId, l1.runId]);
  expect(lastRun("a", b)?.status).toBe("error");
  expect(lastRun("nix", b)).toBeUndefined();
  expect(listRuns("nix", b)).toEqual([]);
});

test("running ohne Ende und toter Prozess gilt als timeout", () => {
  const b = base();
  mkdirSync(join(b, "a"));
  const row = { runId: "r1", slug: "a", trigger: "schedule", start: "2026-01-01T00:00:00.000Z", status: "running", pid: 999999 };
  writeFileSync(join(b, "a", "runs.jsonl"), JSON.stringify(row) + "\n");
  expect(listRuns("a", b, () => false)[0].status).toBe("timeout");
  expect(listRuns("a", b, () => true)[0].status).toBe("running");
});

test("kaputte Zeile wird übersprungen", () => {
  const b = base();
  mkdirSync(join(b, "a"));
  const ok = { runId: "r1", slug: "a", trigger: "schedule", start: "2026-01-01T00:00:00.000Z", status: "success" };
  writeFileSync(join(b, "a", "runs.jsonl"), "{kaputt\n" + JSON.stringify(ok) + "\n");
  expect(listRuns("a", b).length).toBe(1);
});

const mode = (p: string) => statSync(p).mode & 0o777;

test("#10: neuer Agent-Ordner 0700, Lauf-Dateien 0600 (auch bei offener umask)", () => {
  const b = join(base(), "state");
  const old = process.umask(0o000);
  try {
    const log = new RunLog("a", "schedule", b);
    log.start();
    log.message({ type: "x" });
    log.finish({ status: "success" });
    expect(mode(join(b, "a"))).toBe(0o700);
    expect(mode(join(b, "a", "runs.jsonl"))).toBe(0o600);
    expect(mode(join(b, "a", `${log.runId}.jsonl`))).toBe(0o600);
  } finally {
    process.umask(old);
  }
});

test("#10: bestehende Rechte werden nachgezogen", () => {
  const b = base();
  chmodSync(b, 0o755);
  mkdirSync(join(b, "a"), { mode: 0o755 });
  writeFileSync(join(b, "a", "runs.jsonl"), "", { mode: 0o644 });
  chmodSync(join(b, "a"), 0o755);
  chmodSync(join(b, "a", "runs.jsonl"), 0o644);
  const log = new RunLog("a", "schedule", b);
  log.start();
  expect(mode(join(b, "a"))).toBe(0o700);
  expect(mode(join(b, "a", "runs.jsonl"))).toBe(0o600);
});

test("Review #10: Rechte eines bestehenden Basisordners bleiben unverändert", () => {
  const b = base();
  chmodSync(b, 0o755);
  new RunLog("a", "schedule", b).start();
  expect(mode(b)).toBe(0o755);
  chmodSync(b, 0o750);
  new RunLog("c", "schedule", b).start();
  expect(mode(b)).toBe(0o750);
});

// #9: PID-Wiederverwendung — Startzeit und Boot-ID in der running-Zeile
const selfStart = () => {
  const s = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  return s.slice(s.lastIndexOf(")") + 2).split(" ")[19];
};
const bootId = () => readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
const runningRow = (extra: object) => ({ runId: "r1", slug: "a", trigger: "schedule", start: "2026-01-01T00:00:00.000Z", status: "running", pid: process.pid, ...extra });
const writeRows = (b: string, ...rows: object[]) => {
  mkdirSync(join(b, "a"), { recursive: true });
  writeFileSync(join(b, "a", "runs.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
};

test("#9: running-Zeile trägt pidStart und bootId, nicht im Ergebnis", () => {
  const b = base();
  new RunLog("a", "schedule", b).start();
  const row = JSON.parse(readFileSync(join(b, "a", "runs.jsonl"), "utf8").trim());
  expect(row.pid).toBe(process.pid);
  expect(row.pidStart).toBe(selfStart());
  expect(row.bootId).toBe(bootId());
  const r = listRuns("a", b)[0] as any;
  expect(r.status).toBe("running");
  expect(r.pidStart).toBeUndefined();
  expect(r.bootId).toBeUndefined();
});

test("#9: lebende PID mit anderer Startzeit gilt als timeout", () => {
  const b = base();
  writeRows(b, runningRow({ pidStart: "1", bootId: bootId() }));
  expect(listRuns("a", b)[0].status).toBe("timeout");
});

test("#9: andere Boot-ID gilt als timeout", () => {
  const b = base();
  writeRows(b, runningRow({ pidStart: selfStart(), bootId: "00000000-0000-0000-0000-000000000000" }));
  expect(listRuns("a", b)[0].status).toBe("timeout");
});

test("#9: passende PID, Startzeit und Boot-ID bleiben running", () => {
  const b = base();
  writeRows(b, runningRow({ pidStart: selfStart(), bootId: bootId() }));
  expect(listRuns("a", b)[0].status).toBe("running");
});

test("#9: alte Zeile ohne Identität: Lebendtest der PID wie bisher", () => {
  const b = base();
  writeRows(b, runningRow({}));
  expect(listRuns("a", b)[0].status).toBe("running");
  writeRows(b, runningRow({ pid: 2 ** 22 + 1 }));
  expect(listRuns("a", b)[0].status).toBe("timeout");
});
