# runner-notify

## ADDED Requirements

### Requirement: Benachrichtigung bei Fehler
Der Runner SHALL bei Endstatus `error`, `timeout` oder `auth_missing` genau eine Desktop-Benachrichtigung mit dem Agentennamen, dem Status und der gekürzten Fehlermeldung senden; bei `success` keine.

#### Scenario: Fehler
- **WHEN** ein Lauf mit status error endet
- **THEN** wird `notify-send -a agent-planner "<Name>: error" "<Fehler>"` einmal aufgerufen

#### Scenario: Erfolg
- **WHEN** ein Lauf mit status success endet
- **THEN** wird keine Benachrichtigung gesendet

#### Scenario: Lange Meldung
- **WHEN** die Fehlermeldung länger als 200 Zeichen ist
- **THEN** wird sie auf 200 Zeichen gekürzt und endet mit „…"

#### Scenario: notify-send fehlt
- **WHEN** das Senden der Benachrichtigung fehlschlägt
- **THEN** endet der Lauf trotzdem normal mit seinem Status
