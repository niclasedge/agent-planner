import type { Hono } from "hono";
import type { EditCtx } from "../actions";
import type { Ctx } from "./ctx";

/**
 * Erlaubte Werte des Host-Headers: Loopback (immer) plus `AGENT_PLANNER_ALLOWED_HOSTS`
 * (Komma-Liste `host:port`, #19). Klein geschrieben; verglichen wird exakt.
 */
export function allowedHosts(port: number, env: Record<string, string | undefined> = process.env): Set<string> {
  const extra = (env.AGENT_PLANNER_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...extra]);
}

/** IPv4 als 32-Bit-Zahl; `::ffff:a.b.c.d` (IPv4-mapped) wird entpackt. Sonst undefined. */
function ipv4(ip: string): number | undefined {
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(ip.trim());
  if (!m) return undefined;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return undefined;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

type Net = { base: number; mask: number };

/**
 * Erlaubte Quellnetze: 127.0.0.0/8 (immer) plus `AGENT_PLANNER_ALLOWED_CLIENTS` (Komma-Liste IPv4-CIDR
 * oder einzelne IPv4, #19). Ein ungültiger Eintrag wirft — lieber kein Start als eine stille Lücke.
 */
export function allowedClients(env: Record<string, string | undefined> = process.env): Net[] {
  const nets: Net[] = [{ base: 0x7f000000, mask: 0xff000000 }];
  for (const raw of (env.AGENT_PLANNER_ALLOWED_CLIENTS ?? "").split(",").map((e) => e.trim()).filter(Boolean)) {
    const m = /^([^/]+)(?:\/(\d{1,2}))?$/.exec(raw);
    const addr = m && !m[1].includes(":") ? ipv4(m[1]) : undefined;
    const bits = m?.[2] === undefined ? 32 : Number(m[2]);
    if (addr === undefined || bits > 32) throw new Error(`AGENT_PLANNER_ALLOWED_CLIENTS: "${raw}" ist kein IPv4-Netz (a.b.c.d/n)`);
    if (bits < 8) throw new Error(`AGENT_PLANNER_ALLOWED_CLIENTS: "${raw}" ist zu weit, Präfix mindestens /8`);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    nets.push({ base: (addr & mask) >>> 0, mask });
  }
  return nets;
}

/** Liegt die Quell-IP in einem erlaubten Netz? `::1` ist Loopback; andere IPv6 nie. */
export function clientAllowed(ip: string, nets: Net[]): boolean {
  if (ip.trim() === "::1") return true;
  const a = ipv4(ip);
  return a !== undefined && nets.some((n) => ((a & n.mask) >>> 0) === n.base);
}

/**
 * Schutz vor fremden Netzen, DNS-Rebinding und CSRF; `createApp` hängt ihn vor allen Routen ein.
 * (0) alle Methoden: Quell-IP (`c.env.ip`, von server.ts aus Bun `requestIP`) aus `allowedClients`.
 *     Tailscale nimmt vor ufw an; das hier ist die eigentliche Netzgrenze. Fail-closed: fehlt
 *     `c.env.ip`, gilt die Anfrage als fremd (Tests übergeben `{ ip: "127.0.0.1" }`).
 * (a) alle Methoden: Host aus `allowedHosts` (Hostname case-insensitive). Ohne Host-Header (nur
 *     `app.request` im Prozess; Browser senden ihn immer) dürfen GET/HEAD durch.
 * (b) nicht GET/HEAD: Origin bzw. Sec-Fetch-Site, falls gesetzt, same-origin.
 * (c) nicht GET/HEAD: `HX-Request: true` Pflicht — ein Formular einer fremden Seite kann ihn nicht setzen.
 */
export function guard(app: Hono, ctx: Ctx) {
  const port = (ctx as EditCtx).port ?? Number(process.env.AGENT_PLANNER_PORT ?? 4317);
  const hosts = allowedHosts(port);
  const nets = allowedClients();
  app.use("*", async (c, next) => {
    const ip = (c.env as { ip?: unknown } | undefined)?.ip;
    if (!(typeof ip === "string" && clientAllowed(ip, nets))) return c.text("Abgelehnt: Quelle", 403);
    const host = c.req.header("host")?.toLowerCase();
    const safe = c.req.method === "GET" || c.req.method === "HEAD";
    const deny = (why: string) => c.text(`Abgelehnt: ${why}`, 403);
    if (host === undefined ? !safe : !hosts.has(host)) return deny("Host");
    if (safe) return next();
    const origin = c.req.header("origin");
    const site = c.req.header("sec-fetch-site");
    if (origin !== undefined && origin !== `http://${host}`) return deny("Origin");
    if (site !== undefined && site !== "same-origin") return deny("Sec-Fetch-Site");
    if (c.req.header("hx-request") !== "true") return deny("HX-Request fehlt");
    return next();
  });
}
