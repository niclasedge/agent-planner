# run-log

## ADDED Requirements

### Requirement: Index runs.jsonl
Das System SHALL je Lauf bei Start eine Zeile `status: running` und am Ende eine zweite Zeile mit derselben runId in `<state>/<slug>/runs.jsonl` anhängen; Basis aus `AGENT_PLANNER_STATE`.

#### Scenario: Zwei Zeilen
- **WHEN** ein Lauf endet
- **THEN** stehen zwei Zeilen mit derselben runId in der Datei

### Requirement: Leser
Das System SHALL `listRuns(slug)` (je runId zusammengefasst, neueste zuerst) und `lastRun(slug)` liefern.

#### Scenario: Zusammenfassen
- **WHEN** ein Lauf running und success gemeldet hat
- **THEN** liefert listRuns einen Eintrag mit Status success

### Requirement: Verwaister Lauf
Eine `running`-Zeile ohne Ende und ohne lebenden Prozess SHALL als `timeout` gelten.

#### Scenario: Prozess tot
- **WHEN** der Prozess der running-Zeile nicht mehr lebt
- **THEN** meldet der Leser den Status timeout

### Requirement: Nachrichtenlog
Das System SHALL alle SDK-Nachrichten je Zeile in `<runId>.jsonl` schreiben.

#### Scenario: Anhängen
- **WHEN** zwei Nachrichten geschrieben werden
- **THEN** hat die Datei zwei JSON-Zeilen
