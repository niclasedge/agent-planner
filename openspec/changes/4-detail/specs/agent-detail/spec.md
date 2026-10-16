# agent-detail

## ADDED Requirements

### Requirement: Detailseite
Das System SHALL unter `/agents/:slug` Kopf, Verlauf und Einstellungen eines Agenten zeigen.

#### Scenario: Kopf eines aktiven Agenten
- **WHEN** ein aktiver Agent mit nächstem Lauf morgen 07:00 geöffnet wird
- **THEN** zeigt der Kopf den Namen, einen eingeschalteten Schalter mit `hx-post` auf `/agents/:slug/toggle`, die Pille „Aktiv“, „Nächste Ausführung: morgen um 07:00“, einen Link auf `/agents/:slug/edit`, einen Papierkorb mit `hx-post` auf `/agents/:slug/archive` und `hx-confirm` sowie „Jetzt ausführen“ mit `hx-post` auf `/agents/:slug/run`

#### Scenario: Pausierter Agent
- **WHEN** ein pausierter Agent geöffnet wird
- **THEN** zeigt der Kopf die Pille „Pausiert“ und einen ausgeschalteten Schalter

#### Scenario: Einstellungen
- **WHEN** die Seite eines Agenten mit `cwd` `/home/u/notes-vault` und Cron `0 7 * * *` geöffnet wird
- **THEN** stehen rechts Anweisungen (Prompt als Markdown), Projekt „notes-vault“, Wiederholung „Täglich um 07:00“, Berechtigungen „Automatisch genehmigen“ und Grenzen „30 min · 100 Turns · 50 USD“

#### Scenario: Langer Prompt
- **WHEN** der Prompt länger als 600 Zeichen ist
- **THEN** ist er gekürzt dargestellt und lässt sich aufklappen

#### Scenario: Unbekannter Agent
- **WHEN** ein Slug ohne Agent-Datei geöffnet wird
- **THEN** antwortet das System mit 404

#### Scenario: Neuer Agent bleibt erreichbar
- **WHEN** `/agents/new` abgerufen wird
- **THEN** reicht die Detailroute die Anfrage an die nächste Route weiter

### Requirement: Verlauf
Das System SHALL die Läufe eines Agenten neueste zuerst mit Datum, Auslöser und Punkten listen.

#### Scenario: Beschriftung
- **WHEN** Läufe heute 07:09, gestern 07:09 und am 4. Oktober 07:08 (manuell) vorliegen
- **THEN** lauten die Einträge „Heute um 07:09“, „Gestern um 07:09“ und „4. Okt. um 07:08 · Manuell“ in dieser Reihenfolge

#### Scenario: Punkte
- **WHEN** ein beendeter Lauf neuer ist als die Marke in `seen.json` bzw. ein Lauf mit Fehler, Zeitüberschreitung oder fehlender Anmeldung endete
- **THEN** trägt der Eintrag einen blauen bzw. roten Punkt

### Requirement: Lauf-Detail
Das System SHALL unter `/agents/:slug/runs/:runId` Ergebnis, Kennzahlen und Werkzeugaufrufe eines Laufs zeigen.

#### Scenario: Beendeter Lauf
- **WHEN** ein erfolgreicher Lauf mit Result-Nachricht und Werkzeugaufrufen geöffnet wird
- **THEN** zeigt die Seite das Ergebnis als Markdown, Status, Dauer, Turns, Kosten, Auslöser und Start sowie in einem `<details>` je Werkzeugaufruf Name und kurzen Input

#### Scenario: htmx-Fragment
- **WHEN** der Lauf mit Header `HX-Request` abgerufen wird
- **THEN** besteht die Antwort aus dem rechten Bereich und per `hx-swap-oob` aktualisiertem Verlauf und Sidebar

#### Scenario: Laufender Lauf
- **WHEN** der Lauf den Status `running` hat
- **THEN** trägt der Bereich `hx-trigger="every 3s"`; ist der Lauf beendet, fehlt das Attribut

#### Scenario: Unbekannter Lauf
- **WHEN** eine runId nicht im Verlauf steht
- **THEN** antwortet das System mit 404

### Requirement: Lesestatus
Das System SHALL gelesene Läufe in `seen.json` im State-Ordner festhalten.

#### Scenario: Öffnen markiert gelesen
- **WHEN** ein beendeter Lauf geöffnet wird
- **THEN** gilt er und jeder ältere Lauf des Agenten als gelesen, jüngere bleiben ungelesen

#### Scenario: Sidebar
- **WHEN** ein Agent einen ungelesenen Lauf hat bzw. sein letzter Lauf fehlschlug
- **THEN** zeigt sein Sidebar-Eintrag einen blauen bzw. roten Punkt

### Requirement: Sicheres Markdown
Das System SHALL Markdown aus Prompts und Agent-Ausgaben ohne rohes HTML und ohne `javascript:`-Links rendern.

#### Scenario: Rohes HTML
- **WHEN** das Ergebnis `<script>alert(1)</script>` oder `<img src=x onerror=alert(1)>` enthält
- **THEN** erscheint es escaped als Text

#### Scenario: Gefährlicher Link
- **WHEN** das Ergebnis `[x](javascript:alert(1))` enthält
- **THEN** wird kein `href` mit `javascript:` ausgegeben
