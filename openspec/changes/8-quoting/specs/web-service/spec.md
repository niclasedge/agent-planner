# web-service

## ADDED Requirements

### Requirement: Neustart bei der Installation
`just install` SHALL den Dienst `agent-planner-web.service` nach `enable --now` neu starten, damit ein erneuter Aufruf nach einem Update den neuen Stand ausliefert.

#### Scenario: Rezept install
- **WHEN** `just --show install` läuft
- **THEN** enthält das Rezept `systemctl --user restart agent-planner-web.service`
