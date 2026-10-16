# Vorschlag: 1-gerippe

Issue: #2 (Karte #1). Ohne UI, Ende-zu-Ende: Agent-Datei -> systemd-Units -> Lauf -> `runs.jsonl`.

## Warum
Das Gerüst muss stehen, bevor App (#3) und Bearbeiten (#5) darauf bauen. Der Logvertrag (Q5) ist die Schnittstelle zu allen Folge-Slices.

## Was sich ändert
- Agent-Datei `<slug>.md` lesen und schreiben (Q3, Q12).
- Cron -> `OnCalendar=` übersetzen, Prüfung per `systemd-analyze calendar` (Q1).
- Units erzeugen und abgleichen (`sync`).
- Runner mit Agent SDK, `permissionMode: "auto"` (Q7), Status `auth_missing` ohne Anmeldung (Q6).
- Log `runs.jsonl` + `<runId>.jsonl` (Q4), Leser-API.
- CLI `agent-planner sync | run | validate-cron`.

## Entscheidung: Auslöser `manual` bei `systemctl --user start`
Der Runner kennt den Auslöser aus (1) `--manual`, (2) Env `AGENT_PLANNER_TRIGGER=manual`, (3) einer Marker-Datei `<state>/<slug>/manual`, die der Runner beim Start liest und löscht; sonst `schedule`.
Für „Jetzt ausführen" (Slice #6) schreibt die App die Marker-Datei und startet dann `systemctl --user start agent-planner@<slug>.service`.
Verworfen: `systemctl --user set-environment` (setzt globalen Zustand des Managers, gilt für alle Agenten, Race zwischen Timer und manuellem Start, muss wieder zurückgenommen werden) und ein Instanz-Drop-in (schreibt Unit-Dateien und braucht `daemon-reload` pro Klick). Die Marker-Datei ist je Agent, atomar, ohne Manager-Zustand. Env bleibt für Tests und Skripte.

## Berührte Dateien
- `package.json`, `bun.lock`, `tsconfig.json`, `.gitignore`
- `src/agent.ts`, `src/cron.ts`, `src/units.ts`, `src/log.ts`, `src/runner.ts`
- `bin/agent-planner`
- `test/agent.test.ts`, `test/cron.test.ts`, `test/units.test.ts`, `test/log.test.ts`, `test/runner.test.ts`
- `README.md`
- `openspec/**`
