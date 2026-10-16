# state-permissions

## ADDED Requirements

### Requirement: Rechte der Lauf-Logs
Das System SHALL die Agent-Ordner mit Rechten 0700 und `runs.jsonl` sowie `<runId>.jsonl` mit 0600 anlegen, weil sie komplette Agent-Ausgaben enthalten.

#### Scenario: Neuer Lauf
- **WHEN** ein Lauf in einen leeren State-Ordner schreibt
- **THEN** hat der Agent-Ordner 0700 und beide Dateien 0600, unabhängig von der umask

#### Scenario: Bestehender Ordner
- **WHEN** der Agent-Ordner bereits mit 0755 und `runs.jsonl` mit 0644 existieren
- **THEN** haben sie nach dem Lauf 0700 bzw. 0600

#### Scenario: Basisordner unverändert
- **WHEN** der Basisordner bereits mit 0755 existiert
- **THEN** behält er nach dem Lauf 0755
