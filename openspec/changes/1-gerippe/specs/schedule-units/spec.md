# schedule-units

## ADDED Requirements

### Requirement: Cron nach OnCalendar
Das System SHALL 5-Felder-Cron (Wochentage, Listen, Bereiche, `*/n`) nach `OnCalendar=` übersetzen und eine menschenlesbare Form liefern.

#### Scenario: Wochentags
- **WHEN** `0 8 * * 1-5` übersetzt wird
- **THEN** ist OnCalendar `Mon..Fri *-*-* 08:00:00` und die Lesbarform „Wochentags um 08:00"

#### Scenario: Täglich und Freitag
- **WHEN** `0 7 * * *` bzw. `0 16 * * 5` übersetzt wird
- **THEN** lauten die Lesbarformen „Täglich um 07:00" bzw. „Jeden Freitag um 16:00"

#### Scenario: Nicht übersetzbar
- **WHEN** ein Ausdruck mit falscher Feldzahl oder Wertebereich übergeben wird
- **THEN** wirft das System einen klaren Fehler

### Requirement: Units erzeugen
Das System SHALL ein Template `agent-planner@.service`, je Agent `agent-planner@<slug>.timer` (OnCalendar, Persistent=true) und `agent-planner@<slug>.service.d/limits.conf` mit `RuntimeMaxSec` schreiben.

#### Scenario: Limits
- **WHEN** ein Agent timeout 45 hat
- **THEN** enthält limits.conf `RuntimeMaxSec=2700`

### Requirement: Abgleich
Das System SHALL mit `sync` neue und geänderte Units schreiben, `daemon-reload` aufrufen, aktive Agenten per `enable --now` Timer und deaktivierte per `disable` behandeln; systemctl ist injizierbar.

#### Scenario: Aktiv und deaktiviert
- **WHEN** ein aktiver und ein deaktivierter Agent synchronisiert werden
- **THEN** wird für den ersten `enable --now <timer>`, für den zweiten `disable <timer>` aufgerufen

#### Scenario: Unverändert
- **WHEN** nichts geändert ist
- **THEN** wird `daemon-reload` nicht aufgerufen
