import { createApp } from "./app";
import { defaultCtx } from "./ctx";
import { demoNextRuns } from "./demo";
import { allowedHosts } from "./guard";

/** URLs für die Log-Zeile: bei Wildcard-Bind Loopback plus die erlaubten Hosts (#19). */
export function listenUrls(hostname: string, port: number, env: Record<string, string | undefined>): string[] {
  if (hostname !== "0.0.0.0" && hostname !== "::") return [`http://${hostname}:${port}/`];
  const hosts = [...allowedHosts(port, env)].filter((h) => h !== `localhost:${port}`);
  return hosts.map((h) => `http://${h}/`);
}

type IpSource = { requestIP(req: Request): { address: string } | null };

/** Fetch-Handler für Bun.serve: reicht die Quell-IP als `c.env.ip` an den Guard (#19); fehlt sie, leer = abgelehnt. */
export function serveFetch(app: { fetch: (req: Request, env: { ip: string }) => Response | Promise<Response> }) {
  return (req: Request, server: IpSource) => app.fetch(req, { ip: server.requestIP(req)?.address ?? "" });
}

if (import.meta.main) {
  const ctx = defaultCtx();
  if (process.env.AGENT_PLANNER_DEMO) ctx.nextRuns = demoNextRuns(ctx.agentDir);
  const hostname = process.env.AGENT_PLANNER_HOST || "127.0.0.1";
  const port = Number(process.env.AGENT_PLANNER_PORT ?? 4317);
  const app = await createApp(ctx);
  const server = Bun.serve({ hostname, port, fetch: serveFetch(app) });
  console.log(`agent-planner: ${listenUrls(hostname, server.port ?? port, process.env).join(" ")}`);
}
