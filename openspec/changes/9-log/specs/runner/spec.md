# runner

## ADDED Requirements

### Requirement: Ursache von SIGTERM
Erhält der Runner SIGTERM, SHALL er den Lauf abbrechen und mit `timeout` melden, wenn die Laufzeit des Prozesses mindestens das Zeitlimit abzüglich einer Toleranz von min(5 s, 10 % des Limits) erreicht hat, sonst mit dem Status `stopped`. Ein Lauf mit `stopped` SHALL keine Benachrichtigung auslösen.

#### Scenario: Manuell gestoppt
- **WHEN** SIGTERM eintrifft, bevor das Zeitlimit erreicht ist
- **THEN** endet der Lauf mit status stopped und es wird keine Benachrichtigung gesendet

#### Scenario: RuntimeMaxSec
- **WHEN** SIGTERM eintrifft, nachdem die Laufzeit das Limit abzüglich Toleranz erreicht hat
- **THEN** endet der Lauf mit status timeout

### Requirement: Gültigkeit des manual-Markers
Der Runner SHALL die Marker-Datei `<state>/<slug>/manual` nur auswerten und löschen, wenn weder `--manual` noch `AGENT_PLANNER_TRIGGER=manual` den Auslöser bestimmt haben. Der Marker SHALL nur als `manual` zählen, wenn sein Inhalt eine ISO-Zeit höchstens 60 s in der Vergangenheit (bis 5 s in der Zukunft) ist; ein abgelaufener oder unlesbarer Marker wird gelöscht und zählt als `schedule`.

#### Scenario: Frischer Marker
- **WHEN** der Marker vor 10 s geschrieben wurde
- **THEN** ist trigger manual und die Datei ist gelöscht

#### Scenario: Abgelaufener Marker
- **WHEN** der Marker vor 120 s geschrieben wurde
- **THEN** ist trigger schedule und die Datei ist gelöscht

#### Scenario: Flag hat entschieden
- **WHEN** `--manual` gesetzt ist und ein Marker liegt
- **THEN** ist trigger manual und der Marker bleibt liegen
