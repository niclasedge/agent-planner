# Vorschlag: 19-lan

Issue: #19, dazu der CLI-Teil aus #13. Karte #1 (Q8: bisher nur 127.0.0.1:4317).

## Warum
Die Web-App soll aus dem LAN 192.0.2.0/24 erreichbar sein (Nutzerentscheid 2026-10-06: Schreibrecht für alle LAN-Geräte, kein Login). Bisher bindet `server.ts` fest an 127.0.0.1, und der Guard lässt nur `127.0.0.1:<port>` und `localhost:<port>` als Host durch. Die Firewall ist über das Runbook (Tag `agent-planner`) bereits offen.

## Was sich ändert
- `src/web/server.ts`: Bind-Adresse aus `AGENT_PLANNER_HOST` (Vorgabe `127.0.0.1`). Die Log-Zeile nennt die erreichbaren URLs: bei `0.0.0.0`/`::` Loopback plus jeden erlaubten Host, sonst die Bind-Adresse. Start nur bei `import.meta.main`, damit `listenUrls` testbar ist.
- `src/web/guard.ts`: `allowedHosts(port, env)` = Loopback (`127.0.0.1:<port>`, `localhost:<port>`, immer) plus `AGENT_PLANNER_ALLOWED_HOSTS` (Komma-Liste `host:port`, getrimmt, leere Einträge ignoriert). Vergleich exakt, Hostname case-insensitive (Host-Header und Liste klein geschrieben). Origin/Sec-Fetch-Site/HX-Request bleiben; Origin wird gegen `http://<host>` des (klein geschriebenen) Host-Headers geprüft, damit same-origin aus dem LAN funktioniert und ein anderer LAN-Host als Origin abgelehnt wird.
- `systemd/agent-planner-web.service`: `AGENT_PLANNER_HOST=0.0.0.0`, `AGENT_PLANNER_ALLOWED_CLIENTS=192.0.2.0/24`, `AGENT_PLANNER_ALLOWED_HOSTS=192.0.2.65:4317`.
- `README.md`: Abschnitt „LAN-Zugriff" mit URL, Firewall-Hinweis und Restrisiko.
- `src/web/guard.ts` (Review-Blocker): Quell-IP-Prüfung für alle Methoden vor der Host-Prüfung. `server.ts` reicht `server.requestIP(req)` als `c.env.ip` durch (`serveFetch`); ein HTTP-Client kann `c.env` nicht setzen. Erlaubt: `127.0.0.0/8`, `::1` und `AGENT_PLANNER_ALLOWED_CLIENTS` (Komma-Liste IPv4-CIDR, Vorgabe nur Loopback); `::ffff:a.b.c.d` zählt als IPv4. Verstoß → 403 „Abgelehnt: Quelle“. Fail-closed: fehlt `c.env.ip`, ist die Anfrage abgelehnt (Tests im Prozess übergeben `{ ip: "127.0.0.1" }`). Ungültige Einträge, `0.0.0.0/0` und Präfixe kürzer als `/8` werfen beim Start.
- `bin/agent-planner` (aus #13): `validate-cron` und `sync` geben Warnungen für nie feuernde Zeitpläne auf stderr aus (Exit bleibt 0).
- `bin/agent-planner` (Review #9): `run` endet bei `stopped` (`systemctl stop`) mit Exit 0, damit die Unit nicht auf „failed“ steht; `error`, `timeout`, `auth_missing` weiter ≠ 0.

## Entscheidungen
- **Host-Liste statt Netzbereich.** Der Host-Header-Check schützt vor DNS-Rebinding; eine Liste fester Namen/IPs hält ihn exakt. Ein Muster wie `192.0.2.*` würde Rebinding auf beliebige LAN-IPs nicht verhindern und ist nicht nötig, weil der Rechner genau eine LAN-Adresse hat.
- **Quell-IP statt Firewall als Grenze.** Die iptables-Kette `ts-input` von Tailscale nimmt alles von `tailscale0` an, bevor ufw greift; mit `0.0.0.0` war die App aus dem Tailnet erreichbar (Review: gefälschter `Host: 127.0.0.1:…` an die Tailscale-IP ergab 200). Der Nutzer hat nur LAN entschieden. Die Host-Liste schützt vor Rebinding, nicht vor fremden Netzen; das leistet nur die Quell-IP. `dev-vm` fällt aus der Host-Liste, weil es zugleich der MagicDNS-Name ist.
- **Nur IPv4-CIDR in der Liste.** Gebunden wird an `0.0.0.0` (IPv4); IPv6 außer `::1` wird abgelehnt (fail closed).
- **Loopback bleibt immer erlaubt**, auch ohne Liste — lokaler Zugriff und bestehende Tests ändern sich nicht.
- **Vorgabe bleibt 127.0.0.1.** LAN-Betrieb ist eine bewusste Einstellung der Unit, nicht das Verhalten von `bun src/web/server.ts`.
- **Restrisiko akzeptiert (Nutzerentscheid):** jedes LAN-Gerät kann Agenten im Auto Mode anlegen und starten, also Befehle als Nutzer ausführen. CSRF-Schutz bleibt, Authentisierung gibt es keine. Abhilfe später: Login.

## Berührte Dateien
- `src/web/server.ts`, `src/web/guard.ts`
- `systemd/agent-planner-web.service`, `README.md`, `bin/agent-planner`
- `test/web/edit-guard.test.ts`, `test/web/server.test.ts`, `test/cli.test.ts`, `test/web/edit.test.ts` (`runnerPath` als Liste, #18)
- `test/web-app.test.ts`, `test/web/detail.test.ts`, `test/web/edit.test.ts`, `test/web/overview-next.test.ts`, `test/web/templates.test.ts`: nur `{ ip: "127.0.0.1" }` als Env-Argument von `app.request` (fail-closed)
- `docs/belege/19-lan.png`, `docs/belege/19-proben.txt`
- `openspec/changes/19-lan/**`
