# runner

## ADDED Requirements

### Requirement: Fehlende Anmeldung
Fehlt `ANTHROPIC_BASE_URL` oder `ANTHROPIC_AUTH_TOKEN`, SHALL der Runner ohne SDK-Aufruf mit Status `auth_missing` enden.

#### Scenario: Keine Variablen
- **WHEN** beide fehlen
- **THEN** wird die SDK-Funktion nicht aufgerufen und die Endzeile hat status auth_missing

### Requirement: Lauf mit SDK
Der Runner SHALL `query()` mit permissionMode auto, executable bun, cwd, model, maxTurns, maxBudgetUsd aufrufen und aus dem Result Status, Kosten, Turns und sessionId in die Endzeile übernehmen.

#### Scenario: Erfolg
- **WHEN** das SDK ein Result mit subtype success liefert
- **THEN** ist status success und costUsd, turns, sessionId sind gesetzt

#### Scenario: Fehler
- **WHEN** das Result is_error ist
- **THEN** ist status error und error enthält die Meldung

### Requirement: Zeitlimit
Der Runner SHALL den Lauf über einen AbortController nach `timeout` Minuten beenden und mit Status `timeout` melden.

#### Scenario: Abbruch
- **WHEN** das Limit überschritten wird
- **THEN** ist status timeout

### Requirement: Auslöser
Der Runner SHALL den Auslöser `manual` setzen bei `--manual`, Env `AGENT_PLANNER_TRIGGER=manual` oder Marker-Datei `<state>/<slug>/manual` (wird dabei gelöscht); sonst `schedule`.

#### Scenario: Marker
- **WHEN** die Marker-Datei existiert
- **THEN** ist trigger manual und die Datei ist danach gelöscht

### Requirement: CLI
`agent-planner` SHALL `sync`, `run <slug> [--manual]` und `validate-cron '<expr>'` anbieten.

#### Scenario: validate-cron
- **WHEN** ein gültiger Ausdruck übergeben wird
- **THEN** gibt die CLI OnCalendar und Lesbarform aus und endet mit 0
