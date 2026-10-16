# schedule-units

## ADDED Requirements

### Requirement: Laufzeitgrenze bei Type=oneshot
Das System SHALL in `agent-planner@<slug>.service.d/limits.conf` die Laufzeitgrenze als `TimeoutStartSec=` schreiben, mit dem Zeitlimit des Agenten in Sekunden (mindestens 1) plus 60 s Puffer, und SHALL kein `RuntimeMaxSec=` schreiben, das systemd bei `Type=oneshot` ignoriert.

#### Scenario: Limits mit Puffer
- **WHEN** ein Agent timeout 45 hat
- **THEN** enthält limits.conf `TimeoutStartSec=2760` und kein `RuntimeMaxSec`

#### Scenario: Sehr kleines Limit
- **WHEN** ein Agent timeout 0.001 hat
- **THEN** enthält limits.conf `TimeoutStartSec=61`

#### Scenario: verify ohne Warnung
- **WHEN** `systemd-analyze --user verify` die erzeugte Instanz prüft
- **THEN** ist stderr leer und der Exit-Code 0
