# Aufgaben

- [x] 1. OpenSpec-Change anlegen und validieren
- [x] 2. Test `test/web/edit-guard.test.ts` (LAN-Host erlaubt, Groß-/Kleinschreibung, fremder Host 403, Origin eines anderen LAN-Hosts 403, DNS-Rebinding-Host 403, Loopback ohne Liste)
- [x] 3. Test `test/web/server.test.ts` (`listenUrls`, Start mit Vorgabe 127.0.0.1)
- [x] 4. Test `test/cli.test.ts` (Warnung bei `validate-cron` und `sync`)
- [x] 5. Tests laufen rot
- [x] 6. Umsetzen: `src/web/guard.ts`, `src/web/server.ts`, `bin/agent-planner`
- [x] 7. `systemd/agent-planner-web.service`, `README.md`
- [x] 8. Tests grün (eigene, dann `bun test`)
- [x] 9. Beleg `docs/belege/19-lan.png` (eigener Server auf 0.0.0.0:4326, Aufruf über die LAN-IP)
- [x] 10. Review-Blocker: Test Quell-IP (LAN 200, Tailnet 403, andere private IP 403, Loopback 200, IPv4-mapped, ungültige CIDR) rot
- [x] 11. Umsetzen: `allowedClients`/`clientAllowed` in `src/web/guard.ts`, `serveFetch` in `src/web/server.ts`, Unit, README
- [x] 12. Beleg `docs/belege/19-proben.txt` (LAN 200, Tailscale-IP 403 Quelle, gefälschter Loopback-Host an Tailscale-IP 403)
- [x] 13. Nachreview: Tests (rot) fail-closed ohne `c.env.ip`, Präfix < /8; Server-Test deckt `serveFetch` (Gegenprobe mit `app.fetch` → 403)
- [x] 14. Umsetzen in `src/web/guard.ts`; In-Prozess-Tests übergeben `{ ip: "127.0.0.1" }`; README Subnetz-Route Peer-Gerät
