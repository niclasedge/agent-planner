# Vorschlag: 12-web-haertung

Issue: #12 (entdeckt im Review von #3), Karte #1.

## Warum
Das Review von #3 fand vier Schwachstellen in der Web-Schicht: ein doppelt dekodierter Pfad lässt `/css/%25` und `/css/a%00.css` mit 500 statt 404 enden; `layout()` reicht jeden String roh durch, sodass ein selbst gebauter String mit Agentdaten unescaped in die Seite käme; ein kaputtes Routenmodul verhindert den Start der ganzen App; `htmx.org` steht unter `dependencies`, obwohl es nur zum Vendoren nach `public/vendor/` dient. CSRF/Host-Prüfung, Test-Isolation und der nächste Lauf auf der Karte sind bereits in #4, #5 und #6 erledigt und nicht Teil dieses Changes.

## Was sich ändert
- `src/web/app.ts` `staticFile`: kein zweites `decodeURIComponent` (Hono dekodiert den Parameter bereits); `Bun.file`/`exists()` in `try/catch`, jeder Fehler → 404.
- `src/web/layout.ts`: `sidebar` und `main` sind vom Typ `HtmlEscapedString | Promise<HtmlEscapedString>` (Ergebnis von `` html`…` ``) und werden direkt in das Template gesetzt statt per `raw(String(…))`. Ein reiner String wird dadurch escaped; ein Promise wird aufgelöst statt als `[object Promise]` ausgegeben.
- `src/web/app.ts` `createApp`: wirft ein Routenmodul beim Import, fehlt `register` oder wirft `register`, wird das Modul übersprungen und eine Zeile `agent-planner: Routenmodul <datei> übersprungen: <grund>` auf stderr geschrieben. Die übrigen Module laden weiter.
- `package.json`: `htmx.org` nach `devDependencies`; `bun.lock` entsprechend.
- Nachtrag aus dem Review von #9: `src/web/routes/overview.ts` führt keine eigene Status-Tabelle mehr, sondern nutzt `STATUS_LABEL` aus `src/web/data.ts` (dort steht `stopped: "Gestoppt"` schon). `public/css/base.css` bekommt `.state--stopped`, neutral grau, kein Fehlerrot.

## Entscheidungen
- **Sidebar nach Name, Karten nach nächstem Lauf — bewusst verschieden.** Die Sidebar ist Navigation: ihre Reihenfolge muss stabil bleiben, damit ein Eintrag nicht wandert, während man klickt, und jeder Agent an derselben Stelle steht wie beim letzten Besuch. Die Karten der Übersicht beantworten „was läuft als Nächstes“; sie sortieren deshalb nach nächstem Lauf und lassen sich per `?sort=name` umstellen. Ein Angleichen hätte einen der beiden Zwecke geopfert. Die README-Notiz dazu gehört zu #19 und wird dort ergänzt.
- Nur `layout()` wird verschärft. Die übrigen `raw()`-Aufrufe in `agent-detail.ts` betreffen feste SVG-Konstanten und gerendertes Markdown (Sanitizing ist Sache von `markdown.ts`, #4) und bleiben.
- Kein Typprüfer im Repo: die Typ-Verschärfung wirkt für Editor/`tsc`, der Laufzeitschutz kommt allein daher, dass Hono reine Strings escaped.
- Übersprungene Module zählen nicht als Startfehler; Fehler beim Lesen des Routenordners selbst bleiben ein Startfehler.

## Berührte Dateien
- `src/web/app.ts`, `src/web/layout.ts`, `src/web/routes/overview.ts`
- `public/css/base.css` (nur `.state--stopped`)
- `package.json`, `bun.lock`
- `test/web-app.test.ts`, `test/web/layout.test.ts` (neu)
- `openspec/changes/12-web-haertung/**`
