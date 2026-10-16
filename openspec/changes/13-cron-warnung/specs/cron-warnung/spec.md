# cron-warnung

## ADDED Requirements

### Requirement: Nie feuernde Zeitpläne erkennen
Das System SHALL für einen OnCalendar-Ausdruck per `systemd-analyze calendar --iterations=1` feststellen, ob es einen nächsten Termin gibt, und für einen Cron-Ausdruck ohne nächsten Termin eine Warnung liefern.

#### Scenario: 31. Februar
- **WHEN** `cronWarning("0 9 31 2 *")` aufgerufen wird
- **THEN** ist das Ergebnis eine Warnung, die `*-02-31 09:00:00` und „feuert nie“ nennt

#### Scenario: Normaler Plan
- **WHEN** `cronWarning("0 7 * * *")` aufgerufen wird
- **THEN** ist das Ergebnis `undefined`

#### Scenario: Ungültiger Ausdruck
- **WHEN** `cronWarning` einen nicht übersetzbaren Ausdruck erhält oder systemd-analyze mit Exit ≠ 0 endet
- **THEN** ist das Ergebnis `undefined`, die Ablehnung bleibt Sache der bestehenden Prüfung

#### Scenario: Liste für sync
- **WHEN** `cronWarnings` Agenten mit `0 9 31 2 *` und `0 7 * * *` erhält
- **THEN** enthält das Ergebnis genau eine Warnung, die den Slug des ersten Agenten nennt

### Requirement: Warnung im Formular
Das Formular SHALL einen nie feuernden Zeitplan als Warnung anzeigen und das Speichern trotzdem zulassen.

#### Scenario: Live-Prüfung warnt
- **WHEN** `GET /cron/check?expr=0 9 31 2 *` abgerufen wird
- **THEN** enthält die Antwort einen Hinweis der Klasse `af-hint--warn` mit „feuert nie“ und keinen Fehler

#### Scenario: Speichern mit Warnung
- **WHEN** `POST /agents` mit Cron `0 9 31 2 *` und sonst gültigen Feldern gesendet wird
- **THEN** wird die Agent-Datei geschrieben, und die Antwort leitet per `HX-Redirect` auf `/agents/<slug>/edit?saved=1`, wo „Gespeichert“ und die Warnung sichtbar sind

#### Scenario: Speichern ohne Warnung
- **WHEN** ein Agent mit Cron `0 7 * * *` gespeichert wird
- **THEN** leitet die Antwort wie bisher auf `/agents/<slug>`
