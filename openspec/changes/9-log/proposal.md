# Vorschlag: 9-log

Issue: #9 (Log-Härtung, entdeckt im Review von #2; Karte #1).

## Warum
Drei Stellen im Lauf-Log melden einen falschen Zustand:
1. Jedes SIGTERM gilt als `timeout`, auch ein bewusstes `systemctl --user stop`. Ein angehaltener Lauf löst damit eine Fehler-Benachrichtigung aus und erscheint rot.
2. Eine `running`-Zeile prüft nur, ob ihre PID lebt. Nach einem Neustart oder bei PID-Wiederverwendung gehört die PID einem fremden Prozess, und der tote Lauf bleibt für immer `running`.
3. Der Marker `<state>/<slug>/manual` wird von jedem Lauf verbraucht, auch wenn Flag oder Env schon entschieden haben, und hat keine Gültigkeit: ein liegengebliebener Marker macht einen beliebig späteren Zeitplan-Lauf zu `manual`.

## Was sich ändert
- Neuer Endstatus `stopped` („Gestoppt"): SIGTERM vor Erreichen des Zeitlimits. Kein Fehler, keine Benachrichtigung.
- Die `running`-Zeile trägt zusätzlich `pidStart` (Feld 22 aus `/proc/<pid>/stat`) und `bootId` (`/proc/sys/kernel/random/boot_id`). Der Leser vergleicht beide; weicht eins ab, ist der Lauf tot (`timeout` wie bisher). Fehlen die Felder (alte Zeilen, kein `/proc`), gilt der bisherige `kill(pid, 0)`-Test.
- Marker gilt nur 60 s ab dem Zeitstempel in der Datei (den `runNow` schon als ISO-Zeit schreibt) und wird nur gelesen und verbraucht, wenn weder `--manual` noch `AGENT_PLANNER_TRIGGER=manual` entschieden haben. Ein abgelaufener oder unlesbarer Marker wird entfernt und zählt nicht.

## Entscheidungen
- **SIGTERM-Ursache über die Laufzeit, nicht über systemd.** systemd sendet bei `RuntimeMaxSec` und bei `stop` dasselbe SIGTERM und gibt dem Prozess keine Ursache mit: `$SERVICE_RESULT`/`$EXIT_STATUS` gibt es nur in `ExecStop=`/`ExecStopPost=`, also *nach* dem Hauptprozess — der Runner hat seine Endzeile dann schon geschrieben. Eine Abfrage per `systemctl show` beim Signal wäre ein Wettlauf mit dem Kill und braucht den User-Bus. Belastbar ist dagegen die Laufzeit: `RuntimeMaxSec` ist `timeout × 60` Sekunden (`src/units.ts`), gemessen ab Dienststart; der Runner misst ab Prozessstart (`process.uptime()`), also höchstens um den Bun-Start zu kurz. SIGTERM bei Laufzeit ≥ Limit − Toleranz → `timeout`, sonst `stopped`. Toleranz = min(5 s, 10 % des Limits). Ein `stop` in den letzten 5 s eines 30-Minuten-Laufs zählt damit als `timeout` — dieser Rest ist hinnehmbar.
- Das interne Zeitlimit (setTimeout) bleibt und meldet immer `timeout`.
- `stopped` ist kein Fehler: nicht in `FAILED` des Runners, keine Benachrichtigung. In der UI nur das Label in `STATUS_LABEL` (`src/web/data.ts`); `isFailed` bleibt unverändert, `stopped` ist also kein roter Punkt.
- PID-Identität: Startzeit **und** Boot-ID, weil die Startzeit in Ticks seit Boot nach einem Neustart zufällig wieder passen kann.
- Marker: Gültigkeit aus dem Dateiinhalt (ISO-Zeit), nicht aus mtime, weil `runNow` den Zeitstempel ohnehin schreibt; `src/actions.ts` bleibt unverändert. Uhrabweichung bis 5 s in die Zukunft wird toleriert. Der Restfall „Marker liegt, Timer feuert vor dem manuellen Start" bleibt bewusst `manual`: systemd startet dieselbe Instanz nicht doppelt, das `start --no-block` fällt in den laufenden Timerlauf, es gibt genau einen Lauf, und der Benutzer hat ihn angefordert.
- Bestehender Status `timeout` für verwaiste Läufe bleibt (kein neuer Status für „abgestürzt").

## Berührte Dateien
- `src/log.ts`, `src/runner.ts`
- `src/web/data.ts` (nur `STATUS_LABEL`)
- `test/log.test.ts`, `test/runner.test.ts`
- `openspec/changes/9-log/**`
