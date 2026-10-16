# templates

## ADDED Requirements

### Requirement: Vorlagen-Dateien
Das System SHALL unter `templates/` vier Vorlagen im Format der Agent-Dateien bereitstellen, jeweils zusätzlich mit den Frontmatter-Feldern `icon` und `summary`.

#### Scenario: Vier gültige Vorlagen
- **WHEN** die Dateien unter `templates/` als Agent-Dateien gelesen werden
- **THEN** sind es genau claude-code-news, wochenrueckblick, repo-lage und ai-news, alle gültig, mit nicht leerem `icon`, `summary` und Prompt

#### Scenario: Zeitpläne
- **WHEN** die Zeitpläne der Vorlagen gelesen werden
- **THEN** lauten sie `0 7 * * *`, `0 16 * * 5`, `0 8 * * 1-5` und `0 9 * * *`

### Requirement: Vorlagen-Abschnitt in der Übersicht
Das System SHALL unter den Karten einen Abschnitt „Mit einer Vorlage beginnen" zeigen, abgesetzt durch eine Wellenlinie, mit je Vorlage Icon, Titel, Einzeiler und Lesbarform des Zeitplans.

#### Scenario: Klick füllt das Formular
- **WHEN** die Übersicht mit Vorlagen gerendert wird
- **THEN** verweist jede Vorlage auf `/agents/new?template=<slug>`

#### Scenario: Lesbarform
- **WHEN** eine Vorlage den Zeitplan `0 16 * * 5` hat
- **THEN** zeigt der Eintrag „Jeden Freitag um 16:00"

#### Scenario: Gleicher Vorlagenordner wie das Formular
- **WHEN** `AGENT_PLANNER_TEMPLATES` auf einen anderen Ordner zeigt
- **THEN** zeigen Übersicht und `/agents/new?template=<slug>` dieselben Vorlagen aus diesem Ordner

#### Scenario: Keine Vorlagen
- **WHEN** keine Vorlagen gelesen werden können
- **THEN** fehlt der Abschnitt und die Übersicht wird trotzdem ausgeliefert

#### Scenario: Escaping
- **WHEN** Titel oder Einzeiler HTML enthalten
- **THEN** wird es escaped ausgegeben
