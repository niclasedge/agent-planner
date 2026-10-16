import { test, expect } from "bun:test";
import { listenUrls, serveFetch } from "../../src/web/server";

// #19: Log-Zeile nennt die erreichbaren URLs
test("#19 listenUrls: Vorgabe 127.0.0.1", () => {
  expect(listenUrls("127.0.0.1", 4317, {})).toEqual(["http://127.0.0.1:4317/"]);
});

test("#19 listenUrls: 0.0.0.0 nennt Loopback und die erlaubten Hosts", () => {
  expect(listenUrls("0.0.0.0", 4317, { AGENT_PLANNER_ALLOWED_HOSTS: "192.0.2.65:4317, planner-host:4317" })).toEqual([
    "http://127.0.0.1:4317/",
    "http://192.0.2.65:4317/",
    "http://planner-host:4317/",
  ]);
});

test("#19 listenUrls: konkrete Adresse", () => {
  expect(listenUrls("192.0.2.65", 4326, {})).toEqual(["http://192.0.2.65:4326/"]);
});

// Deckt server.ts als Ganzes ab: der Guard ist fail-closed, ein 200 über 127.0.0.1 heißt also,
// dass die gestartete Fetch-Funktion die Quell-IP wirklich mitgibt (nicht `fetch: app.fetch`).
test("#19 server: ohne AGENT_PLANNER_HOST bindet an 127.0.0.1, loggt die URL und reicht die Quell-IP durch", async () => {
  // freier Port vom System (Port 0 geht nicht direkt: der Guard braucht den Port für die Host-Liste)
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port;
  probe.stop(true);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    AGENT_PLANNER_DIR: "demo/agents",
    AGENT_PLANNER_STATE: "demo/state",
    AGENT_PLANNER_PORT: String(port),
  };
  delete env.AGENT_PLANNER_HOST;
  delete env.AGENT_PLANNER_ALLOWED_HOSTS;
  const p = Bun.spawn([process.execPath, "src/web/server.ts"], { env, stdout: "pipe", stderr: "pipe" });
  try {
    const reader = p.stdout.getReader();
    const { value } = await reader.read();
    const line = new TextDecoder().decode(value);
    expect(line).toContain(`http://127.0.0.1:${port}/`);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<html");
  } finally {
    p.kill();
    await p.exited;
  }
});

// #19 Review-Blocker: server.ts reicht die Quell-IP aus Bun an den Guard (c.env.ip)
test("#19 serveFetch: Quell-IP aus server.requestIP landet in c.env.ip, fehlende IP wird leer", async () => {
  const seen: unknown[] = [];
  const app = { fetch: (_req: Request, env: unknown) => { seen.push(env); return new Response("ok"); } };
  const req = new Request("http://x/");
  await serveFetch(app)(req, { requestIP: () => ({ address: "100.64.0.7", family: "IPv4", port: 1 }) });
  await serveFetch(app)(req, { requestIP: () => null });
  expect(seen).toEqual([{ ip: "100.64.0.7" }, { ip: "" }]);
});
