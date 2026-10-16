# web-app

## ADDED Requirements

### Requirement: Formatierer
Das System SHALL Dauern und Zeitpunkte deutsch und in lokaler Zeitzone formatieren.

#### Scenario: Dauer
- **WHEN** 42000 ms bzw. 190000 ms formatiert werden
- **THEN** lauten die Texte "42 s" und "3 min 10 s"

#### Scenario: Relative Zeit
- **WHEN** ein Zeitpunkt am selben Kalendertag liegt
- **THEN** lautet der Text "heute HH:MM", für den Vortag "gestern HH:MM", für den Folgetag "morgen HH:MM"

### Requirement: Kartenübersicht
Das System SHALL unter `/` alle Agenten als Karten mit Name, Prompt-Anfang, Wiederholung, Projekt, letztem Lauf, Dauer und Status zeigen.

#### Scenario: Aktiver Agent
- **WHEN** ein Agent aktiv ist und `0 7 * * *` hat
- **THEN** zeigt die Karte die Pille "Täglich um 07:00" und das Projekt als Basename von cwd

#### Scenario: Pausierter Agent
- **WHEN** ein Agent disabled ist
- **THEN** zeigt die Karte die Pille "Pausiert"

#### Scenario: Kein Lauf
- **WHEN** es keinen Lauf gibt
- **THEN** zeigt die Karte "Noch nie ausgeführt"

### Requirement: Sortierung
Das System SHALL nach "Nächste Ausführung" (Vorgabe) oder "Name" sortieren.

#### Scenario: Nächste Ausführung
- **WHEN** drei Agenten mit verschiedenen nächsten Läufen und einer ohne Timer vorliegen
- **THEN** stehen sie aufsteigend nach nächstem Lauf, der ohne Timer zuletzt

#### Scenario: Fragment
- **WHEN** `/?sort=name` mit Header `HX-Request` abgerufen wird
- **THEN** besteht die Antwort nur aus dem Kartenraster

### Requirement: Nächster Lauf
Das System SHALL den nächsten Lauf über eine injizierbare Funktion aus `systemctl --user list-timers --all --output=json` beziehen.

#### Scenario: Timer vorhanden
- **WHEN** die Timer-Ausgabe den Timer `agent-planner x.timer` mit `next` enthält
- **THEN** ergibt die Zuordnung für Slug `x` diesen Zeitpunkt

#### Scenario: Kein Timer
- **WHEN** für einen Agenten kein Timer gelistet ist
- **THEN** zeigt die Sidebar "—"

### Requirement: Sidebar und Status
Das System SHALL eine Sidebar mit "Übersicht", allen Agenten und "+ Neuer Agent" zeigen.

#### Scenario: Fehlerpunkt
- **WHEN** der letzte Lauf eines Agenten Status error hat
- **THEN** trägt sein Eintrag einen roten Fehlerpunkt

### Requirement: Erweiterbarkeit
Das System SHALL Routenmodule `src/web/routes/*.ts` mit `register(app, ctx)` und CSS `public/css/*.css` automatisch einbinden.

#### Scenario: CSS-Glob
- **WHEN** eine weitere Datei `public/css/x.css` existiert
- **THEN** bindet das Layout `base.css` zuerst und danach die übrigen alphabetisch ein

#### Scenario: Platzhalter
- **WHEN** `/agents/new` abgerufen wird
- **THEN** antwortet die App mit Status 404
