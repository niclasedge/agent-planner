# Vorschlag: 3-app-geruest

Issue: #3 (Karte #1). Nur lesende Web-App: Sidebar + Kartenübersicht auf 127.0.0.1:4317.

## Warum
Gerüst für #4 (Detail), #5 (Bearbeiten) und #6 (Betrieb). Diese laufen parallel und sollen nur **neue Dateien** anlegen müssen.

## Was sich ändert
- Hono-App mit Routenmodulen `src/web/routes/*.ts` (`register(app, ctx)`), per Glob geladen.
- Layout-Helfer, Formatierer (`formatDuration`, `formatRelative`), Datenaufbereitung (Karten, Sortierung).
- Nächster Lauf aus `systemctl --user list-timers --all --output=json`, hinter injizierbarer Funktion.
- Eigenes CSS (`public/css/base.css` + je Feature eine Datei, alphabetisch eingebunden), vendiertes htmx unter `public/vendor/`.
- Demo-Bestand `demo/agents`, `demo/state`, `justfile` (`dev`, `test`).

## Entscheidungen
- Nächster Lauf über `list-timers --output=json` (eine Abfrage für alle Agenten) statt `show` je Timer.
- Platzhalter `/agents/:slug` und `/agents/new` liegen in `routes/zz-platzhalter.ts` (lädt zuletzt); echte Routen aus #4/#5 gewinnen, weil zuerst registriert.
- Sortierung per htmx-Select, Fragment bei `HX-Request`.

## Berührte Dateien
- `package.json`, `bun.lock`, `justfile`, `README.md`
- `src/web/app.ts`, `ctx.ts`, `data.ts`, `format.ts`, `layout.ts`, `sidebar.ts`, `next-run.ts`, `server.ts`, `demo.ts`
- `src/web/routes/overview.ts`, `src/web/routes/zz-platzhalter.ts`
- `public/css/base.css`, `public/vendor/htmx.min.js`
- `demo/agents/*.md`, `demo/state/**`
- `test/web-format.test.ts`, `test/web-data.test.ts`, `test/web-app.test.ts`
- `docs/belege/3-uebersicht.png`
- `openspec/changes/3-app-geruest/**`
