# Vorschlag: 18-timeout

Issue: #18 (entdeckt bei #8; Karte #1, Entscheidung Q12).

## Warum
`limitsConf()` schreibt `RuntimeMaxSec=`, das Template setzt `Type=oneshot`. systemd 261 ignoriert die Kombination (`systemd-analyze verify`: „RuntimeMaxSec= has no effect in combination with Type=oneshot. Ignoring.“). Es gibt damit nur das Zeitlimit im Runner; hängt der Runner selbst, läuft der Dienst unbegrenzt.

## Probe (systemd 261.2, transiente Units, keine echten Units berührt)
- `systemd-run --user --wait -p Type=oneshot -p TimeoutStartSec=3 sleep 10` → `Finished with result: timeout`, `code=killed, status=15/TERM`, Laufzeit 3,4 s, Exit 1.
- Prozess fängt SIGTERM ab (`trap … TERM`), `TimeoutStartSec=2 TimeoutStopSec=2` → Prozess erhält SIGTERM, danach `status=9/KILL`, Laufzeit 4,3 s.
- `-p Type=oneshot -p RuntimeMaxSec=2 sleep 4` → `result: success` nach 4,0 s: RuntimeMaxSec wirkt bei oneshot tatsächlich nicht.

## Was sich ändert
- `limits.conf` schreibt `TimeoutStartSec=` statt `RuntimeMaxSec=`. Bei `Type=oneshot` ist das Start-Timeout die Laufzeitgrenze (der Dienst ist erst „gestartet“, wenn `ExecStart` endet).
- Wert = Runner-Limit in Sekunden (mind. 1) **plus 60 s Puffer**. Der Runner bricht zuerst selbst über sein internes Zeitlimit ab und schreibt `timeout`; systemd greift nur, wenn er hängt.
- Die Tests aus #8 filtern die oneshot-Warnung nicht mehr aus der verify-Ausgabe (`test/units.test.ts`).
- Aus dem Review von #8: `runnerPath` ist durchgehend eine Wortliste `string[]` (`SyncOptions`, `serviceTemplate`, `ActionDeps`, `EditCtx`). Die Heuristik `runnerWords`, die bei einem String per Präfix `process.execPath` zwischen einem und zwei Wörtern rät, entfällt. `unitDeps` liefert `[process.execPath, <repo>/bin/agent-planner]`; `bin/agent-planner` übergibt schon eine Liste.

## Entscheidungen
- **Puffer 60 s, fest.** Der Abbruch über den AbortController braucht Sekunden (SDK-Subprozess beenden, Endzeile schreiben); 60 s sind reichlich und bei 30-Minuten-Läufen unerheblich. Ein relativer Puffer bringt hier nichts.
- **SIGTERM von systemd zählt als `timeout`, ohne Änderung der Logik aus #9.** Bei Eintreffen ist die Laufzeit ≥ Limit + 60 s − Bun-Start, also über der Schwelle Limit − Toleranz. Die Logik bleibt; nur Kommentare nennen jetzt `TimeoutStartSec`. Ein Regressionstest bindet die Schwelle an den Wert aus `limitsConf()`.
- **Toleranz aus #9 bleibt.** Mit dem Puffer ist sie für die systemd-Grenze nicht mehr nötig (ein SIGTERM vor dem Limit ist jetzt immer ein `stop`); sie zu entfernen würde aber den bestehenden Test „SIGTERM am Zeitlimit“ umdrehen. Das ist eine eigene Entscheidung und nicht Teil dieses Fixes.
- `TimeoutStopSec` bleibt systemd-Vorgabe (90 s): genug Zeit für die Endzeile nach SIGTERM; danach SIGKILL, und der Leser erkennt den toten Lauf (#9) als `timeout`.
- Bestehende `limits.conf` werden beim nächsten `sync` neu geschrieben (Inhalt weicht ab → `daemon-reload`).

## Zusammenspiel mit #9 (timeout vs. stopped)
| Ereignis | Zeitpunkt | Status |
|---|---|---|
| internes Zeitlimit (setTimeout) | Limit | `timeout` |
| SIGTERM von systemd (`TimeoutStartSec`) | Limit + 60 s | `timeout` (Laufzeit ≥ Limit − Toleranz) |
| `systemctl --user stop` | vor Limit − Toleranz | `stopped` |
| `stop` in den letzten min(5 s, 10 %) vor dem Limit | — | `timeout` (Rest aus #9, hinnehmbar) |
| Runner endet nach SIGTERM nicht | + `TimeoutStopSec` (90 s) | SIGKILL; Leser wertet die running-Zeile als `timeout` |

## Berührte Dateien
- `src/units.ts`, `src/runner.ts` (nur Kommentare), `src/actions.ts` (nur `runnerPath`)
- `test/units.test.ts`, `test/runner.test.ts`, `test/actions.test.ts` (nur `runnerPath`)
- `openspec/changes/18-timeout/**`

Nicht berührt, obwohl betroffen:
- `test/cli.test.ts` filtert dieselbe Warnung (Zeile 44–45). Der Filter wird wirkungslos, sobald die Warnung fehlt; entfernen in einem eigenen Schritt (Datei liegt außerhalb der Zusage).
- `test/web/edit.test.ts:28`, `test/web/edit-guard.test.ts:15` übergeben `runnerPath: "/r"` als String; zur Laufzeit harmlos (kein Test prüft ExecStart), sollte aber `["/r"]` werden.
