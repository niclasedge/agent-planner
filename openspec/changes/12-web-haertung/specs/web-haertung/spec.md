# web-haertung

## ADDED Requirements

### Requirement: Statische Dateien ohne Doppel-Dekodierung
Das System SHALL den Dateipfad unter `/css/` und `/vendor/` genau einmal dekodieren (durch den Router) und jeden Fehler beim Öffnen der Datei als 404 beantworten.

#### Scenario: Prozentzeichen im Pfad
- **WHEN** `GET /css/%25` abgerufen wird
- **THEN** ist der Status 404

#### Scenario: Nullbyte im Pfad
- **WHEN** `GET /css/a%00.css` abgerufen wird
- **THEN** ist der Status 404

#### Scenario: Ausbruch bleibt gesperrt
- **WHEN** `GET /css/%2e%2e/%2e%2e/package.json` abgerufen wird
- **THEN** ist der Status 404

### Requirement: Seitenrahmen escaped reine Strings
`layout(title, sidebar, main)` SHALL für `sidebar` und `main` nur Ergebnisse von `` html`…` `` (`HtmlEscapedString` oder deren Promise) als HTML übernehmen und jeden reinen String escapen.

#### Scenario: Reiner String mit Skript
- **WHEN** `layout` als `main` den reinen String `<script>alert(1)</script>` erhält
- **THEN** enthält die Ausgabe `&lt;script&gt;alert(1)&lt;/script&gt;` und kein `<script>alert(1)`

#### Scenario: html-Teile bleiben HTML
- **WHEN** `layout` als `sidebar` `` html`<nav>S</nav>` `` und als `main` `` html`<p>${"<b>"}</p>` `` erhält
- **THEN** enthält die Ausgabe `<nav>S</nav>` und `<p>&lt;b&gt;</p>`, ohne doppelte Escapes

#### Scenario: Asynchroner Teil
- **WHEN** ein Teil ein Promise auf ein `HtmlEscapedString` ist
- **THEN** wird sein Inhalt eingesetzt, nicht `[object Promise]`

### Requirement: Kaputtes Routenmodul verhindert den Start nicht
`createApp` SHALL ein Routenmodul, das beim Import wirft, kein `register` exportiert oder in `register` wirft, überspringen, eine Meldung mit dem Dateinamen auf stderr schreiben und die übrigen Module laden.

#### Scenario: Syntaxfehler in einem Modul
- **WHEN** der Routenordner `a-kaputt.ts` (wirft beim Import), `b-ohne.ts` (ohne `register`) und `c-gut.ts` (registriert `/gut`) enthält
- **THEN** liefert `createApp` eine App, `GET /gut` antwortet, und stderr nennt `a-kaputt.ts` und `b-ohne.ts`

### Requirement: Sortierung von Sidebar und Karten
Die Sidebar SHALL Agenten immer nach Name sortieren; die Karten der Übersicht SHALL nach nächstem Lauf sortieren und per `?sort=name` nach Name. Das ist eine bewusste Entscheidung: die Sidebar ist Navigation und braucht eine stabile Reihenfolge, die Übersicht beantwortet „was läuft als Nächstes“.

#### Scenario: Vorgabe der Übersicht
- **WHEN** `GET /` ohne `sort` abgerufen wird
- **THEN** stehen die Karten nach nächstem Lauf, die Sidebar nach Name

### Requirement: htmx nur zur Entwicklung
`package.json` SHALL `htmx.org` unter `devDependencies` führen, nicht unter `dependencies`; ausgeliefert wird die vendorte Datei `public/vendor/htmx.min.js`.

#### Scenario: Abhängigkeiten
- **WHEN** `package.json` gelesen wird
- **THEN** steht `htmx.org` in `devDependencies` und nicht in `dependencies`

### Requirement: Eine Status-Tabelle für alle Seiten
Die Übersicht SHALL den Status des letzten Laufs über `STATUS_LABEL` aus `src/web/data.ts` beschriften, nicht über eine eigene Tabelle. Der Status `stopped` SHALL neutral grau dargestellt werden, nicht in Fehlerrot.

#### Scenario: Gestoppter Lauf
- **WHEN** der letzte Lauf eines Agenten den Status `stopped` hat und `GET /` abgerufen wird
- **THEN** zeigt die Karte `<span class="state state--stopped">Gestoppt</span>` und nirgends das rohe `stopped`, und `public/css/base.css` enthält eine Regel für `.state--stopped` ohne `--red`
