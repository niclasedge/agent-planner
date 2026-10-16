import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgent } from "../src/agent";
import {
  slugify, isSafeSlug, agentPath, validateForm, writeAgentFile, toggleAgent, archiveAgent, runNow, saveAgent, unitDeps,
  type ActionDeps,
} from "../src/actions";

const T = (slug: string) => "agent-planner" + "@" + slug + ".timer";
const S = (slug: string) => "agent-planner" + "@" + slug + ".service";

function setup() {
  const d = mkdtempSync(join(tmpdir(), "ap-act-"));
  const agentDir = join(d, "agents");
  const stateDir = join(d, "state");
  const unitDir = join(d, "units");
  const cwd = join(d, "projekt");
  mkdirSync(agentDir);
  mkdirSync(cwd);
  const calls: string[][] = [];
  const deps: ActionDeps = { agentDir, stateDir, unitDir, runnerPath: ["/r"], systemctl: async (a) => { calls.push(a); } };
  writeFileSync(join(agentDir, "daily.md"), `---\nname: Daily\ncron: "0 7 * * *"\ncwd: ${JSON.stringify(cwd)}\ntags: [a, b]\n---\nHallo\n`);
  return { d, agentDir, stateDir, unitDir, cwd, calls, deps };
}

const form = (cwd: string, o: Record<string, string> = {}) => ({
  name: "Täglicher Bericht", cron: "0 7 * * *", cwd, model: "", prompt: "Schreibe.", timeout: "", maxTurns: "", maxBudgetUsd: "", ...o,
});

test("slugify: Umlaute, Sonderzeichen, Ränder", () => {
  expect(slugify("Täglicher Bericht")).toBe("taeglicher-bericht");
  expect(slugify("  Größe & Maß!! ")).toBe("groesse-mass");
  expect(slugify("A_b--C")).toBe("a_b-c");
  expect(slugify("???")).toBe("");
  expect(slugify("../../etc/passwd")).toBe("etc-passwd");
});

test("isSafeSlug / agentPath: nur [a-z0-9_-], kein Ausbruch", () => {
  expect(isSafeSlug("ok-1_x")).toBe(true);
  for (const s of ["", "../x", "a/b", ".x", "A", "a.b", "-a"]) expect(isSafeSlug(s)).toBe(false);
  expect(agentPath("/x/agents", "ok")).toBe("/x/agents/ok.md");
  expect(() => agentPath("/x/agents", "../ok")).toThrow(/Slug/);
});

test("validateForm: gültig mit Vorgaben", async () => {
  const { agentDir, cwd } = setup();
  const r = await validateForm(form(cwd), { agentDir });
  expect(r.errors).toEqual({});
  expect(r.agent).toMatchObject({ slug: "taeglicher-bericht", name: "Täglicher Bericht", enabled: true, timeout: 30, maxTurns: 100, maxBudgetUsd: 50, prompt: "Schreibe." });
  expect(r.agent!.model).toBeUndefined();
});

test("validateForm: Fehler am Feld", async () => {
  const { agentDir, cwd } = setup();
  const r = await validateForm(form(cwd, { name: "", cron: "0 8 1 * 1", cwd: "/gibt/es/nicht", prompt: " ", timeout: "-1", maxTurns: "2.5", maxBudgetUsd: "abc" }), { agentDir });
  expect(r.agent).toBeUndefined();
  expect(Object.keys(r.errors).sort()).toEqual(["cron", "cwd", "maxBudgetUsd", "maxTurns", "name", "prompt", "timeout"]);
  expect(r.errors.cron).toMatch(/ODER/);
  expect(r.errors.cwd).toMatch(/existiert nicht/);
});

test("validateForm: Slug-Kollision, Name ohne Buchstaben", async () => {
  const { agentDir, cwd } = setup();
  expect((await validateForm(form(cwd, { name: "Daily" }), { agentDir })).errors.name).toMatch(/vergeben/);
  expect((await validateForm(form(cwd, { name: "!!!" }), { agentDir })).errors.name).toMatch(/Buchstaben/);
  // beim Bearbeiten ist der eigene Slug keine Kollision
  const r = await validateForm(form(cwd, { name: "Daily neu" }), { agentDir, slug: "daily" });
  expect(r.agent?.slug).toBe("daily");
});

test("validateForm: ~ wird zum Home-Ordner", async () => {
  const { agentDir } = setup();
  const r = await validateForm(form("~"), { agentDir });
  expect(r.agent?.cwd).toBe(process.env.HOME!);
});

test("writeAgentFile: atomar, fremde Schlüssel bleiben, lesbar", async () => {
  const { agentDir, cwd } = setup();
  const a = { ...loadAgent(agentDir, "daily"), prompt: "Neu" };
  writeAgentFile(agentDir, a);
  const text = readFileSync(join(agentDir, "daily.md"), "utf8");
  expect(text).toContain("tags:");
  expect(loadAgent(agentDir, "daily").prompt).toBe("Neu");
  expect(readdirSync(agentDir)).toEqual(["daily.md"]); // keine Temp-Reste
  expect(cwd.length).toBeGreaterThan(0);
});

test("saveAgent: schreibt und synchronisiert nur diesen Agenten", async () => {
  const { agentDir, unitDir, cwd, calls, deps } = setup();
  mkdirSync(unitDir);
  writeFileSync(join(unitDir, T("fremd")), "x");
  const r = await validateForm(form(cwd), { agentDir });
  await saveAgent(deps, r.agent!);
  expect(existsSync(join(agentDir, "taeglicher-bericht.md"))).toBe(true);
  expect(existsSync(join(unitDir, T("taeglicher-bericht")))).toBe(true);
  expect(existsSync(join(unitDir, T("fremd")))).toBe(true); // kein prune
  expect(calls).toContainEqual(["enable", "--now", T("taeglicher-bericht")]);
});

test("toggleAgent: enabled umschalten + Timer", async () => {
  const { agentDir, calls, deps } = setup();
  expect((await toggleAgent(deps, "daily")).enabled).toBe(false);
  expect(loadAgent(agentDir, "daily").enabled).toBe(false);
  expect(calls).toContainEqual(["disable", "--now", T("daily")]);
  expect(readFileSync(join(agentDir, "daily.md"), "utf8")).toContain("tags:");
  calls.length = 0;
  await toggleAgent(deps, "daily");
  expect(calls).toContainEqual(["enable", "--now", T("daily")]);
});

test("archiveAgent: nach _archiv, Units weg, Logs bleiben, zweites Archiv kollidiert nicht", async () => {
  const { agentDir, stateDir, unitDir, calls, deps } = setup();
  await toggleAgent(deps, "daily"); // erzeugt Units
  mkdirSync(join(stateDir, "daily"), { recursive: true });
  writeFileSync(join(stateDir, "daily", "runs.jsonl"), "{}\n");
  calls.length = 0;
  await archiveAgent(deps, "daily");
  expect(existsSync(join(agentDir, "daily.md"))).toBe(false);
  expect(existsSync(join(agentDir, "_archiv", "daily.md"))).toBe(true);
  expect(existsSync(join(unitDir, T("daily")))).toBe(false);
  expect(existsSync(join(stateDir, "daily", "runs.jsonl"))).toBe(true);
  expect(calls).toContainEqual(["disable", "--now", T("daily")]);
  writeFileSync(join(agentDir, "daily.md"), readFileSync(join(agentDir, "_archiv", "daily.md")));
  await archiveAgent(deps, "daily");
  expect(readdirSync(join(agentDir, "_archiv")).length).toBe(2);
});

test("runNow: Marker + start --no-block; bei Fehler Marker weg", async () => {
  const { stateDir, calls, deps } = setup();
  await runNow(deps, "daily");
  expect(existsSync(join(stateDir, "daily", "manual"))).toBe(true);
  expect(calls).toContainEqual(["start", "--no-block", S("daily")]);
  const failing: ActionDeps = { ...deps, systemctl: async (a) => { if (a[0] === "start") throw new Error("kaputt"); } };
  await expect(runNow(failing, "daily")).rejects.toThrow(/kaputt/);
  expect(existsSync(join(stateDir, "daily", "manual"))).toBe(false);
});

test("Aktionen: unbekannter oder ungültiger Slug", async () => {
  const { deps } = setup();
  await expect(toggleAgent(deps, "nix")).rejects.toThrow();
  await expect(archiveAgent(deps, "../x")).rejects.toThrow(/Slug/);
  await expect(runNow(deps, "../../x")).rejects.toThrow(/Slug/);
});

test("unitDeps: Demo nutzt tmp-Unit-Ordner und No-op-systemctl; Env überschreibt", async () => {
  const base = { agentDir: "/a", stateDir: "/s", now: () => new Date(), nextRuns: async () => new Map() };
  const demo = unitDeps(base, { AGENT_PLANNER_DEMO: "1" });
  expect(demo.unitDir).toContain("agent-planner-demo-units");
  await demo.systemctl!(["start", "x"]); // tut nichts
  expect(unitDeps(base, { AGENT_PLANNER_UNIT_DIR: "/u" }).unitDir).toBe("/u");
  expect(unitDeps({ ...base, unitDir: "/c" }, { AGENT_PLANNER_UNIT_DIR: "/u" }).unitDir).toBe("/c");
  const real = unitDeps(base, {});
  expect(real.unitDir).toContain(".config/systemd/user");
  expect(real.runnerPath).toEqual([process.execPath, join(import.meta.dir, "..", "bin/agent-planner")]);
});

// Review: reservierte Slugs, Länge, kein Überschreiben beim Anlegen
test("Slugs: new/edit reserviert, höchstens 64 Zeichen", async () => {
  expect(isSafeSlug("new")).toBe(false);
  expect(isSafeSlug("edit")).toBe(false);
  expect(isSafeSlug("a".repeat(64))).toBe(true);
  expect(isSafeSlug("a".repeat(65))).toBe(false);
  expect(slugify("x".repeat(80) + " y").length).toBeLessThanOrEqual(64);
  expect(slugify("a".repeat(63) + "-b")).not.toMatch(/-$/);
  const { agentDir, cwd } = setup();
  expect((await validateForm(form(cwd, { name: "New" }), { agentDir })).errors.name).toMatch(/reserviert/);
  expect((await validateForm(form(cwd, { name: "Edit" }), { agentDir })).errors.name).toMatch(/reserviert/);
});

test("writeAgentFile exclusive: vorhandene Datei bleibt unverändert", async () => {
  const { agentDir, cwd } = setup();
  const before = readFileSync(join(agentDir, "daily.md"), "utf8");
  const a = { ...loadAgent(agentDir, "daily"), prompt: "Überschrieben" };
  expect(() => writeAgentFile(agentDir, a, { exclusive: true })).toThrow(/existiert/);
  expect(readFileSync(join(agentDir, "daily.md"), "utf8")).toBe(before);
  expect(readdirSync(agentDir)).toEqual(["daily.md"]);
  writeAgentFile(agentDir, { ...a, slug: "neu" }, { exclusive: true });
  expect(loadAgent(agentDir, "neu").prompt).toBe("Überschrieben");
  expect(cwd.length).toBeGreaterThan(0);
});
