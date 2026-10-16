# agent-file

## ADDED Requirements

### Requirement: Agent-Datei lesen
Das System SHALL eine Datei `<slug>.md` mit Frontmatter (name, cron, cwd, model, enabled, timeout, maxTurns, maxBudgetUsd) und Body als Prompt parsen; Vorgaben enabled=true, timeout=30, maxTurns=100, maxBudgetUsd=50.

#### Scenario: Vorgaben
- **WHEN** eine Datei nur name, cron und cwd enthält
- **THEN** sind enabled=true, timeout=30, maxTurns=100, maxBudgetUsd=50 und model leer

#### Scenario: Pflichtfeld fehlt
- **WHEN** cron fehlt
- **THEN** wirft das Lesen einen Fehler, der das Feld nennt

### Requirement: Agent-Datei schreiben
Das System SHALL einen Agenten so schreiben, dass erneutes Lesen dasselbe Ergebnis liefert.

#### Scenario: Roundtrip
- **WHEN** ein Agent geschrieben und wieder gelesen wird
- **THEN** sind alle Felder und der Prompt gleich

### Requirement: Agentenordner
Das System SHALL den Ordner aus `--dir`, sonst aus `AGENT_PLANNER_DIR` auflösen und alle `*.md` darin als Agenten laden; der Slug ist der Dateiname ohne Endung.

#### Scenario: Auflösung
- **WHEN** `--dir` und die Env gesetzt sind
- **THEN** gewinnt `--dir`
