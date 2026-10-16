import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../src/agent";
import { runAgent, detectTrigger, notifySend } from "../src/runner";
import { listRuns } from "../src/log";
import { limitsConf } from "../src/units";

const agent = (extra = "") =>
  parseAgent(`---\nname: t\ncron: "0 3 * * *"\ncwd: /tmp\nmodel: haiku\nmaxTurns: 2\n${extra}---\nAntworte nur mit: ok`, "t");
const auth = { ANTHROPIC_BASE_URL: "http://x", ANTHROPIC_AUTH_TOKEN: "tok" };
const base = () => mkdtempSync(join(tmpdir(), "ap-run-"));
/** Keine echten Desktop-Benachrichtigungen aus Tests. */
const quiet = { notify: () => {} };

test("auth_missing: kein SDK-Aufruf", async () => {
  const b = base();
  let called = false;
  const q: any = () => { called = true; return (async function* () {})(); };
  await runAgent(agent(), { query: q, env: {}, stateBase: b, trigger: "schedule", ...quiet });
  expect(called).toBe(false);
  const r = listRuns("t", b);
  expect(r[0].status).toBe("auth_missing");
  expect(r[0].error).toMatch(/ANTHROPIC/);
});

test("auth_missing auch wenn nur eine Variable fehlt", async () => {
  const b = base();
  const q: any = () => { throw new Error("nicht aufrufen"); };
  await runAgent(agent(), { query: q, env: { ANTHROPIC_BASE_URL: "x" }, stateBase: b, trigger: "schedule", ...quiet });
  expect(listRuns("t", b)[0].status).toBe("auth_missing");
});

test("Erfolg: Optionen und Result-Felder", async () => {
  const b = base();
  let opts: any;
  const q: any = ({ prompt, options }: any) => {
    opts = { prompt, options };
    return (async function* () {
      yield { type: "system", subtype: "init" };
      yield { type: "result", subtype: "success", is_error: false, duration_ms: 10, duration_api_ms: 5, num_turns: 1, total_cost_usd: 0.004, session_id: "sess", result: "ok" };
    })();
  };
  await runAgent(agent(), { query: q, env: auth, stateBase: b, trigger: "manual", ...quiet });
  expect(opts.prompt).toBe("Antworte nur mit: ok");
  expect(opts.options).toMatchObject({ permissionMode: "auto", executable: "bun", cwd: "/tmp", model: "haiku", maxTurns: 2, maxBudgetUsd: 50 });
  expect(opts.options.abortController).toBeInstanceOf(AbortController);
  const r = listRuns("t", b)[0];
  expect(r).toMatchObject({ status: "success", costUsd: 0.004, turns: 1, sessionId: "sess", trigger: "manual" });
  const msgs = readFileSync(join(b, "t", `${r.runId}.jsonl`), "utf8").trim().split("\n");
  expect(msgs.length).toBe(2);
});

test("Fehler-Result", async () => {
  const b = base();
  const q: any = () => (async function* () {
    yield { type: "result", subtype: "error_max_turns", is_error: true, num_turns: 2, total_cost_usd: 0.1, session_id: "s", errors: ["zu viele Turns"] };
  })();
  await runAgent(agent(), { query: q, env: auth, stateBase: b, trigger: "schedule", ...quiet });
  const r = listRuns("t", b)[0];
  expect(r.status).toBe("error");
  expect(r.error).toContain("zu viele Turns");
});

test("Ausnahme im SDK wird zu error", async () => {
  const b = base();
  const q: any = () => (async function* () { throw new Error("boom"); })();
  await runAgent(agent(), { query: q, env: auth, stateBase: b, trigger: "schedule", ...quiet });
  const r = listRuns("t", b)[0];
  expect(r.status).toBe("error");
  expect(r.error).toContain("boom");
});

test("Zeitlimit: Abbruch -> timeout", async () => {
  const b = base();
  const q: any = ({ options }: any) => (async function* () {
    await new Promise((_, rej) => options.abortController.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  })();
  await runAgent(agent(), { query: q, env: auth, stateBase: b, trigger: "schedule", timeoutMs: 20, ...quiet });
  expect(listRuns("t", b)[0].status).toBe("timeout");
});

test("Ende ohne Result gilt als error", async () => {
  const b = base();
  const q: any = () => (async function* () { yield { type: "system" }; })();
  await runAgent(agent(), { query: q, env: auth, stateBase: b, trigger: "schedule", ...quiet });
  expect(listRuns("t", b)[0].status).toBe("error");
});

test("Auslöser: Flag, Env, Marker, sonst schedule", () => {
  const b = base();
  expect(detectTrigger("t", { manualFlag: true, env: {}, stateBase: b })).toBe("manual");
  expect(detectTrigger("t", { env: { AGENT_PLANNER_TRIGGER: "manual" }, stateBase: b })).toBe("manual");
  expect(detectTrigger("t", { env: {}, stateBase: b })).toBe("schedule");
  mkdirSync(join(b, "t"), { recursive: true });
  writeFileSync(join(b, "t", "manual"), new Date().toISOString());
  expect(detectTrigger("t", { env: {}, stateBase: b })).toBe("manual");
  expect(existsSync(join(b, "t", "manual"))).toBe(false);
  expect(detectTrigger("t", { env: {}, stateBase: b })).toBe("schedule");
});

test("Fehlschlag des SDK-Imports schließt den Lauf mit error ab", async () => {
  const b = base();
  const r = await runAgent(agent(), { env: auth, stateBase: b, trigger: "schedule", ...quiet, importSdk: async () => { throw new Error("kein sdk"); } });
  expect(r.status).toBe("error");
  const runs = listRuns("t", b);
  expect(runs[0].status).toBe("error");
  expect(runs[0].error).toContain("kein sdk");
});

// #6: notify-send nur bei Fehler
const recorder = () => {
  const calls: Array<[string, string]> = [];
  return { calls, notify: (title: string, body: string) => { calls.push([title, body]); } };
};
const named = () => parseAgent(`---\nname: Repo-Lage\ncron: "0 8 * * 1-5"\ncwd: /tmp\n---\nx`, "repo-lage");

test("#6: error -> genau eine Benachrichtigung mit Name, Status, Fehler", async () => {
  const n = recorder();
  const q: any = () => (async function* () { throw new Error("boom"); })();
  await runAgent(named(), { query: q, env: auth, stateBase: base(), trigger: "schedule", notify: n.notify });
  expect(n.calls).toEqual([["Repo-Lage: error", "boom"]]);
});

test("#6: auth_missing und timeout benachrichtigen", async () => {
  const n = recorder();
  await runAgent(named(), { env: {}, stateBase: base(), trigger: "schedule", notify: n.notify });
  const q: any = ({ options }: any) => (async function* () {
    await new Promise((_, rej) => options.abortController.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  })();
  await runAgent(named(), { query: q, env: auth, stateBase: base(), trigger: "schedule", timeoutMs: 20, notify: n.notify });
  expect(n.calls.map((c) => c[0])).toEqual(["Repo-Lage: auth_missing", "Repo-Lage: timeout"]);
  expect(n.calls[0][1]).toContain("ANTHROPIC_");
  expect(n.calls[1][1]).toBe("Zeitlimit erreicht");
});

test("#6: success benachrichtigt nicht", async () => {
  const n = recorder();
  const q: any = () => (async function* () {
    yield { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0, session_id: "s", result: "ok" };
  })();
  const r = await runAgent(named(), { query: q, env: auth, stateBase: base(), trigger: "schedule", notify: n.notify });
  expect(r.status).toBe("success");
  expect(n.calls).toEqual([]);
});

test("#6: lange Fehlermeldung wird auf 200 Zeichen gekürzt", async () => {
  const n = recorder();
  const q: any = () => (async function* () { throw new Error("x".repeat(500)); })();
  await runAgent(named(), { query: q, env: auth, stateBase: base(), trigger: "schedule", notify: n.notify });
  const body = n.calls[0][1];
  expect(body.length).toBe(200);
  expect(body.endsWith("…")).toBe(true);
});

test("#6: kaputte Benachrichtigung ändert den Lauf nicht", async () => {
  const b = base();
  const q: any = () => (async function* () { throw new Error("boom"); })();
  const r = await runAgent(named(), { query: q, env: auth, stateBase: b, trigger: "schedule", notify: () => { throw new Error("kein notify"); } });
  expect(r.status).toBe("error");
  expect(listRuns("repo-lage", b)[0].status).toBe("error");
});

test("#6: notifySend ohne Programm läuft still weiter", async () => {
  await expect(notifySend("t", "b", "/gibt/es/nicht/notify-send")).resolves.toBeUndefined();
});

test("#6: notifySend ruft notify-send -a agent-planner <titel> <text>", async () => {
  const d = mkdtempSync(join(tmpdir(), "ap-ns-"));
  const out = join(d, "args");
  const fake = join(d, "notify-send");
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > ${out}\n`, { mode: 0o755 });
  await notifySend("A: error", "kaputt", fake);
  expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["-a", "agent-planner", "--", "A: error", "kaputt"]);
});

test("Review #6: Name mit führendem - kommt als Titel an, nicht als Option", async () => {
  const d = mkdtempSync(join(tmpdir(), "ap-ns-"));
  const out = join(d, "args");
  const fake = join(d, "notify-send");
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > ${out}\n`, { mode: 0o755 });
  await notifySend("-u critical: error", "-x", fake);
  expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["-a", "agent-planner", "--", "-u critical: error", "-x"]);
});

// #9: SIGTERM-Ursache
const waitForAbort = (onStart: () => void): any => ({ options }: any) => (async function* () {
  onStart();
  await new Promise((_, rej) => options.abortController.signal.addEventListener("abort", () => rej(new Error("aborted"))));
})();
const sigterm = () => setTimeout(() => process.emit("SIGTERM" as any), 5);

test("#9: SIGTERM vor dem Zeitlimit -> stopped, keine Benachrichtigung", async () => {
  const b = base();
  const n = recorder();
  const r = await runAgent(named(), { query: waitForAbort(sigterm), env: auth, stateBase: b, trigger: "manual", notify: n.notify, uptimeMs: () => 10_000 });
  expect(r.status).toBe("stopped");
  expect(listRuns("repo-lage", b)[0].status).toBe("stopped");
  expect(n.calls).toEqual([]);
});

test("#9: SIGTERM am Zeitlimit (RuntimeMaxSec) -> timeout", async () => {
  const b = base();
  const n = recorder();
  // Limit 30 min, Laufzeit 29:58 -> innerhalb der Toleranz von 5 s
  const r = await runAgent(named(), { query: waitForAbort(sigterm), env: auth, stateBase: b, trigger: "schedule", notify: n.notify, uptimeMs: () => 30 * 60_000 - 2_000 });
  expect(r.status).toBe("timeout");
  expect(listRuns("repo-lage", b)[0].status).toBe("timeout");
  expect(n.calls.map((c) => c[0])).toEqual(["Repo-Lage: timeout"]);
});

// #18: bei Type=oneshot schickt systemd das SIGTERM bei TimeoutStartSec (Runner-Limit + Puffer)
test("#18: SIGTERM bei TimeoutStartSec aus limitsConf -> timeout mit Benachrichtigung", async () => {
  const a = named();
  const sec = Number(/^TimeoutStartSec=(\d+)$/m.exec(limitsConf(a))?.[1]);
  expect(sec * 1000).toBeGreaterThan(a.timeout * 60_000); // Runner bricht zuerst selbst ab
  const b = base();
  const n = recorder();
  const r = await runAgent(a, { query: waitForAbort(sigterm), env: auth, stateBase: b, trigger: "schedule", notify: n.notify, uptimeMs: () => sec * 1000 });
  expect(r.status).toBe("timeout");
  expect(listRuns("repo-lage", b)[0].status).toBe("timeout");
  expect(n.calls.map((c) => c[0])).toEqual(["Repo-Lage: timeout"]);
});

test("#9: SIGTERM kurz vor der Toleranz -> stopped", async () => {
  const r = await runAgent(named(), { query: waitForAbort(sigterm), env: auth, stateBase: base(), trigger: "schedule", ...quiet, uptimeMs: () => 30 * 60_000 - 6_000 });
  expect(r.status).toBe("stopped");
});

// #9: manual-Marker mit Gültigkeit
const marker = (b: string, content: string) => {
  mkdirSync(join(b, "t"), { recursive: true });
  writeFileSync(join(b, "t", "manual"), content);
  return join(b, "t", "manual");
};
const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

test("#9: frischer Marker -> manual und verbraucht", () => {
  const b = base();
  const m = marker(b, ago(10));
  expect(detectTrigger("t", { env: {}, stateBase: b, now: NOW })).toBe("manual");
  expect(existsSync(m)).toBe(false);
});

test("#9: abgelaufener oder unlesbarer Marker -> schedule und entfernt", () => {
  const b = base();
  const m = marker(b, ago(120));
  expect(detectTrigger("t", { env: {}, stateBase: b, now: NOW })).toBe("schedule");
  expect(existsSync(m)).toBe(false);
  marker(b, "kein datum");
  expect(detectTrigger("t", { env: {}, stateBase: b, now: NOW })).toBe("schedule");
  expect(existsSync(m)).toBe(false);
  marker(b, new Date(NOW + 60_000).toISOString());
  expect(detectTrigger("t", { env: {}, stateBase: b, now: NOW })).toBe("schedule");
});

test("#9: Flag oder Env entscheiden, Marker bleibt liegen", () => {
  const b = base();
  const m = marker(b, ago(10));
  expect(detectTrigger("t", { manualFlag: true, env: {}, stateBase: b, now: NOW })).toBe("manual");
  expect(existsSync(m)).toBe(true);
  expect(detectTrigger("t", { env: { AGENT_PLANNER_TRIGGER: "manual" }, stateBase: b, now: NOW })).toBe("manual");
  expect(existsSync(m)).toBe(true);
});
