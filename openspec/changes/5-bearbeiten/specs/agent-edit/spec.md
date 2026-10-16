# agent-edit

## ADDED Requirements

### Requirement: Formular anlegen und bearbeiten
Das System SHALL unter `/agents/new` und `/agents/:slug/edit` ein Formular mit Name, Cron, Projekt, Modell, Prompt und aufklappbaren Grenzen zeigen und beim Speichern die Agent-Datei schreiben und den Agenten synchronisieren.

#### Scenario: Neuer Agent
- **WHEN** `POST /agents` mit Name „Täglicher Bericht“, Cron `0 7 * * *`, existierendem cwd und Prompt gesendet wird
- **THEN** entsteht `taeglicher-bericht.md`, der Timer wird geschrieben und aktiviert, die Antwort leitet per `HX-Redirect` auf `/agents/taeglicher-bericht`

#### Scenario: Vorlage
- **WHEN** `/agents/new?template=<slug>` abgerufen wird
- **THEN** ist das Formular mit Name, Cron und Prompt der Vorlage vorbefüllt

#### Scenario: Fehler am Feld
- **WHEN** Cron `0 8 1 * 1`, ein fehlendes cwd oder ein bereits vergebener Slug gesendet wird
- **THEN** wird keine Datei geschrieben und das Formular zeigt die Meldung am betroffenen Feld mit den eingegebenen Werten

#### Scenario: Live-Prüfung
- **WHEN** `GET /cron/check?expr=0 7 * * *` abgerufen wird
- **THEN** lautet die Antwort „Täglich um 07:00“; bei ungültigem Ausdruck eine Fehlermeldung

#### Scenario: Bearbeiten erhält fremde Schlüssel
- **WHEN** eine Agent-Datei mit zusätzlichem Frontmatter-Schlüssel gespeichert wird
- **THEN** bleibt der Schlüssel erhalten

### Requirement: Aktionen
Das System SHALL Aktiv-Schalter, Archivieren und Jetzt-Ausführen anbieten.

#### Scenario: Aktiv-Schalter
- **WHEN** `POST /agents/:slug/toggle` für einen aktiven Agenten gesendet wird
- **THEN** steht `enabled: false` in der Datei und der Timer wird mit `disable --now` abgeschaltet

#### Scenario: Archivieren
- **WHEN** `POST /agents/:slug/archive` gesendet wird
- **THEN** liegt die Datei unter `_archiv/`, Timer und Drop-in sind entfernt, das Log bleibt

#### Scenario: Jetzt ausführen
- **WHEN** `POST /agents/:slug/run` gesendet wird
- **THEN** existiert der manual-Marker und `systemctl --user start --no-block agent-planner@<slug>.service` wurde aufgerufen

### Requirement: Pfad-Sicherheit
Das System SHALL nur Slugs aus `[a-z0-9_-]` anlegen und nie außerhalb des Agentenordners schreiben.

#### Scenario: Ausbruch
- **WHEN** ein Slug wie `../x` oder ein Name ohne Buchstaben übergeben wird
- **THEN** wird abgelehnt und keine Datei außerhalb des Agentenordners geschrieben

### Requirement: Schutz vor fremden Seiten
Das System SHALL Nicht-GET-Anfragen nur annehmen, wenn Host lokal ist, Origin/Sec-Fetch-Site same-origin sind und `HX-Request: true` gesetzt ist.

#### Scenario: Fremder Host
- **WHEN** ein POST mit `Host: evil.example:4317` eintrifft
- **THEN** lautet die Antwort 403

#### Scenario: Fremde Herkunft
- **WHEN** ein POST mit `Origin: https://evil.example` oder `Sec-Fetch-Site: cross-site` eintrifft
- **THEN** lautet die Antwort 403

#### Scenario: Ohne htmx
- **WHEN** ein POST ohne `HX-Request: true` eintrifft
- **THEN** lautet die Antwort 403
