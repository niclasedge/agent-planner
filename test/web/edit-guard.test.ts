import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EditCtx } from "../../src/actions";
import { createApp } from "../../src/web/app";

async function app() {
  const d = mkdtempSync(join(tmpdir(), "ap-guard-"));
  mkdirSync(join(d, "agents"));
  writeFileSync(join(d, "agents", "daily.md"), `---\nname: Daily\ncron: "0 7 * * *"\ncwd: /tmp\n---\nP\n`);
  const calls: string[][] = [];
  const ctx: EditCtx = {
    agentDir: join(d, "agents"), stateDir: join(d, "state"), now: () => new Date(), nextRuns: async () => new Map(),
    unitDir: join(d, "units"), systemctl: async (a) => { calls.push(a); }, runnerPath: ["/r"], port: 4317,
  };
  return { app: await createApp(ctx), calls };
}

const ok = { Host: "127.0.0.1:4317", "HX-Request": "true" };
const run = async (headers: Record<string, string>) => {
  const { app, calls } = await app_();
  const res = await app.request("/agents/daily/run", { method: "POST", headers }, { ip: "127.0.0.1" });
  return { status: res.status, calls };
};
const app_ = app;

test("Guard: gültige Anfrage geht durch (localhost und 127.0.0.1)", async () => {
  expect((await run(ok)).status).toBe(200);
  expect((await run({ ...ok, Host: "localhost:4317", Origin: "http://localhost:4317", "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
});

test("Guard (a): fremder oder fehlender Host -> 403", async () => {
  for (const Host of ["evil.example:4317", "127.0.0.1:9999", "127.0.0.1", "127.0.0.1.evil.example:4317"]) {
    const r = await run({ ...ok, Host });
    expect(r.status).toBe(403);
    expect(r.calls).toEqual([]);
  }
  const { app } = await app_();
  expect((await app.request("/agents/daily/run", { method: "POST", headers: { "HX-Request": "true" } }, { ip: "127.0.0.1" })).status).toBe(403);
});

test("Guard (b): fremder Origin oder Sec-Fetch-Site -> 403", async () => {
  const extras: Record<string, string>[] = [
    { Origin: "https://evil.example" },
    { Origin: "null" },
    { Origin: "http://127.0.0.1:9999" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
  ];
  for (const extra of extras) {
    const r = await run({ ...ok, ...extra });
    expect(r.status).toBe(403);
    expect(r.calls).toEqual([]);
  }
});

test("Guard (c): ohne HX-Request: true -> 403", async () => {
  expect((await run({ Host: "127.0.0.1:4317" })).status).toBe(403);
  expect((await run({ Host: "127.0.0.1:4317", "HX-Request": "1" })).status).toBe(403);
});

test("Guard: GET ohne Origin/HX-Request geht durch (lokaler oder fehlender Host)", async () => {
  const { app } = await app_();
  expect((await app.request("/agents/new", undefined, { ip: "127.0.0.1" })).status).toBe(200); // app.request ohne Host = im Prozess
  expect((await app.request("/agents/new", { headers: { Host: "localhost:4317" } }, { ip: "127.0.0.1" })).status).toBe(200);
});

test("Guard (a) gilt für alle Methoden: fremder Host bei GET/HEAD und statischen Dateien -> 403", async () => {
  const { app } = await app_();
  for (const path of ["/", "/agents/new", "/agents/daily", "/css/base.css", "/vendor/htmx.min.js", "/cron/check?expr=x"]) {
    expect((await app.request(path, { headers: { Host: "evil.example:4317" } }, { ip: "127.0.0.1" })).status).toBe(403);
    expect((await app.request(path, { method: "HEAD", headers: { Host: "rebind.evil:4317" } }, { ip: "127.0.0.1" })).status).toBe(403);
  }
});

test("Guard hängt in createApp: auch eine früher sortierte Routendatei ist geschützt", async () => {
  const d = mkdtempSync(join(tmpdir(), "ap-guard-routes-"));
  writeFileSync(join(d, "1-x.ts"), `export function register(app: any) { app.post("/x", (c: any) => c.text("ok")); }`);
  const ctx: EditCtx = { agentDir: d, stateDir: d, now: () => new Date(), nextRuns: async () => new Map(), port: 4317 };
  const a = await createApp(ctx, { routesDir: d });
  expect((await a.request("/x", { method: "POST", headers: { Host: "127.0.0.1:4317" } }, { ip: "127.0.0.1" })).status).toBe(403);
  expect((await a.request("/x", { method: "POST", headers: ok }, { ip: "127.0.0.1" })).status).toBe(200);
});

// #19: LAN-Betrieb — erlaubte Hosts aus AGENT_PLANNER_ALLOWED_HOSTS, Loopback immer
async function lanApp(allowed: string | undefined) {
  const prev = process.env.AGENT_PLANNER_ALLOWED_HOSTS;
  if (allowed === undefined) delete process.env.AGENT_PLANNER_ALLOWED_HOSTS;
  else process.env.AGENT_PLANNER_ALLOWED_HOSTS = allowed;
  try {
    return await app_();
  } finally {
    if (prev === undefined) delete process.env.AGENT_PLANNER_ALLOWED_HOSTS;
    else process.env.AGENT_PLANNER_ALLOWED_HOSTS = prev;
  }
}
const LAN = " 192.0.2.65:4317 , planner-host:4317,,";
const post = async (allowed: string | undefined, headers: Record<string, string>) => {
  const { app, calls } = await lanApp(allowed);
  const res = await app.request("/agents/daily/run", { method: "POST", headers }, { ip: "127.0.0.1" });
  return { status: res.status, calls };
};

test("#19 Guard: LAN-Host aus der Liste geht durch (same-origin, Hostname case-insensitive)", async () => {
  const lan = { Host: "192.0.2.65:4317", Origin: "http://192.0.2.65:4317", "Sec-Fetch-Site": "same-origin", "HX-Request": "true" };
  const r = await post(LAN, lan);
  expect(r.status).toBe(200);
  expect(r.calls.length).toBeGreaterThan(0);
  expect((await post(LAN, { ...lan, Host: "PLANNER-HOST:4317", Origin: "http://planner-host:4317" })).status).toBe(200);
  const { app } = await lanApp(LAN);
  expect((await app.request("/", { headers: { Host: "192.0.2.65:4317" } }, { ip: "127.0.0.1" })).status).toBe(200);
});

test("#19 Guard: Loopback bleibt mit Liste erlaubt", async () => {
  expect((await post(LAN, ok)).status).toBe(200);
  expect((await post(LAN, { ...ok, Host: "localhost:4317" })).status).toBe(200);
});

test("#19 Guard: fremder Host -> 403, auch mit Liste", async () => {
  for (const Host of ["evil.example:4317", "192.0.2.20:4317", "192.0.2.65", "planner-host"]) {
    const r = await post(LAN, { ...ok, Host });
    expect(r.status).toBe(403);
    expect(r.calls).toEqual([]);
  }
});

test("#19 Guard: Origin eines anderen (auch erlaubten) LAN-Hosts -> 403", async () => {
  const lan = { Host: "192.0.2.65:4317", "HX-Request": "true" };
  for (const Origin of ["http://192.0.2.20:4317", "http://planner-host:4317", "http://127.0.0.1:4317", "https://192.0.2.65:4317"]) {
    const r = await post(LAN, { ...lan, Origin });
    expect(r.status).toBe(403);
    expect(r.calls).toEqual([]);
  }
});

test("#19 Guard: DNS-Rebinding-Host -> 403 (Präfix, Suffix, anderer Port)", async () => {
  const { app } = await lanApp(LAN);
  for (const Host of ["192.0.2.65.rebind.evil:4317", "x.192.0.2.65:4317", "planner-host.evil.example:4317", "192.0.2.65:9999", "planner-host:43170"]) {
    expect((await app.request("/", { headers: { Host } }, { ip: "127.0.0.1" })).status).toBe(403);
    expect((await post(LAN, { ...ok, Host })).status).toBe(403);
  }
});

test("#19 Guard: ohne Liste kein LAN-Host", async () => {
  expect((await post(undefined, { ...ok, Host: "192.0.2.65:4317" })).status).toBe(403);
  expect((await post("", { ...ok, Host: "192.0.2.65:4317" })).status).toBe(403);
  expect((await post(undefined, ok)).status).toBe(200);
});

// #19 Review-Blocker: Tailscale nimmt vor ufw an -> Quell-IP ist die eigentliche Grenze.
// Die IP kommt aus server.ts als c.env.ip (Bun requestIP); ein HTTP-Client kann sie nicht setzen.
async function srcApp(clients: string | undefined) {
  const keys = ["AGENT_PLANNER_ALLOWED_HOSTS", "AGENT_PLANNER_ALLOWED_CLIENTS"] as const;
  const prev = keys.map((k) => process.env[k]);
  process.env.AGENT_PLANNER_ALLOWED_HOSTS = "192.0.2.65:4317";
  if (clients === undefined) delete process.env.AGENT_PLANNER_ALLOWED_CLIENTS;
  else process.env.AGENT_PLANNER_ALLOWED_CLIENTS = clients;
  try {
    return await app_();
  } finally {
    keys.forEach((k, i) => (prev[i] === undefined ? delete process.env[k] : (process.env[k] = prev[i])));
  }
}
const fromIp = async (clients: string | undefined, ip: string, method = "POST", Host = "192.0.2.65:4317") => {
  const { app, calls } = await srcApp(clients);
  const headers: Record<string, string> = method === "POST" ? { Host, Origin: `http://${Host}`, "HX-Request": "true" } : { Host };
  const res = await app.request(method === "POST" ? "/agents/daily/run" : "/", { method, headers }, { ip });
  return { status: res.status, body: await res.text(), calls };
};
const LAN_NET = "192.0.2.0/24";

test("#19 Quelle: LAN-IP aus AGENT_PLANNER_ALLOWED_CLIENTS -> 200 (GET und POST, auch IPv4-mapped)", async () => {
  for (const ip of ["192.0.2.20", "::ffff:192.0.2.20", "::FFFF:192.0.2.65"]) {
    expect((await fromIp(LAN_NET, ip, "GET")).status).toBe(200);
    expect((await fromIp(LAN_NET, ip)).status).toBe(200);
  }
});

test("#19 Quelle: Tailnet-IP 100.x -> 403 Quelle, auch mit gefälschtem Loopback-Host", async () => {
  for (const ip of ["100.64.0.7", "::ffff:100.64.0.7"]) {
    for (const [method, Host] of [["GET", "192.0.2.65:4317"], ["POST", "192.0.2.65:4317"], ["GET", "127.0.0.1:4317"], ["POST", "127.0.0.1:4317"]]) {
      const r = await fromIp(LAN_NET, ip, method, Host);
      expect(r.status).toBe(403);
      expect(r.body).toBe("Abgelehnt: Quelle");
      expect(r.calls).toEqual([]);
    }
  }
});

test("#19 Quelle: andere private IP oder Nachbarnetz -> 403", async () => {
  for (const ip of ["10.0.0.5", "198.51.100.20", "192.0.3.20", "172.16.0.1", "fe80::1", "fd7a:115c:a1e0::1", "", "kaputt"]) {
    const r = await fromIp(LAN_NET, ip, "GET");
    expect([ip, r.status, r.body]).toEqual([ip, 403, "Abgelehnt: Quelle"]);
  }
});

test("#19 Quelle: Loopback (127.0.0.0/8, ::1, ::ffff:127.0.0.1) -> 200, auch ohne Liste", async () => {
  for (const clients of [undefined, LAN_NET]) {
    for (const ip of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]) {
      expect((await fromIp(clients, ip, "POST", "127.0.0.1:4317")).status).toBe(200);
    }
  }
});

test("#19 Quelle: Vorgabe nur Loopback — LAN-IP ohne AGENT_PLANNER_ALLOWED_CLIENTS -> 403", async () => {
  expect((await fromIp(undefined, "192.0.2.20", "GET")).status).toBe(403);
  expect((await fromIp("", "192.0.2.20", "GET")).status).toBe(403);
});

test("#19 Quelle: Prüfung kommt vor dem Host — fremde IP mit gültigem Host -> Quelle", async () => {
  expect((await fromIp(LAN_NET, "100.64.0.1", "GET", "127.0.0.1:4317")).body).toBe("Abgelehnt: Quelle");
});

test("#19 Quelle: ungültige CIDR-Liste -> createApp wirft (Start scheitert laut)", async () => {
  for (const bad of ["192.0.2.0/33", "192.0.2/24", "fd00::/8", "irgendwas"]) {
    await expect(srcApp(bad)).rejects.toThrow(/AGENT_PLANNER_ALLOWED_CLIENTS/);
  }
  // Nachreview: 0.0.0.0/0 und Präfixe kürzer als /8 öffnen zu weit -> Start scheitert mit klarer Meldung
  for (const wide of ["0.0.0.0/0", "192.0.2.0/24, 0.0.0.0/0", "10.0.0.0/7", "1.2.3.4/1"]) {
    await expect(srcApp(wide)).rejects.toThrow(/AGENT_PLANNER_ALLOWED_CLIENTS: "[^"]+" ist zu weit, Präfix mindestens \/8/);
  }
  expect((await fromIp("10.0.0.0/8", "10.200.1.1", "GET")).status).toBe(200);
  expect((await fromIp("192.0.2.0/24, 10.1.2.3", "10.1.2.3", "GET")).status).toBe(200);
  expect((await fromIp("192.0.2.0/24, 10.1.2.3", "10.1.2.4", "GET")).status).toBe(403);
});

test("#19 Nachreview fail-closed: ohne c.env.ip -> 403 Quelle (alle Methoden)", async () => {
  const { app, calls } = await srcApp(undefined);
  for (const env of [undefined, {}, { ip: undefined }, { ip: 42 }]) {
    const g = await app.request("/", { headers: { Host: "127.0.0.1:4317" } }, env as any);
    expect([g.status, await g.text()]).toEqual([403, "Abgelehnt: Quelle"]);
    const p = await app.request("/agents/daily/run", { method: "POST", headers: ok }, env as any);
    expect([p.status, await p.text()]).toEqual([403, "Abgelehnt: Quelle"]);
  }
  expect(calls).toEqual([]);
});
