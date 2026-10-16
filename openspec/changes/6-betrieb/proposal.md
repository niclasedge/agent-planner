# Vorschlag: 6-betrieb

Issues: #6 (Slice 5 „Betrieb", Karte #1) und #10 (Härtung aus dem Review von #2).

## Warum
Die App soll ohne Handarbeit als Benutzerdienst laufen, Fehler sollen auffallen, ohne dass jemand die Seite offen hat, und neue Agenten sollen aus zugeschnittenen Vorlagen entstehen. Die Lauf-Logs enthalten komplette Agent-Ausgaben und dürfen nur für den Benutzer lesbar sein.

## Was sich ändert
- Vier Vorlagen unter `templates/` (Claude-Code-News, Wochenrückblick, Repo-Lage, AI-News) im Format der Agent-Dateien plus `icon` und `summary`.
- Übersicht: Abschnitt „Mit einer Vorlage beginnen" unter einer Wellenlinie; je Vorlage Icon, Titel, Einzeiler, Uhr + Lesbarform des Zeitplans; Klick führt zu `/agents/new?template=<slug>` (Route aus #5).
- Runner: bei `error`, `timeout`, `auth_missing` eine Desktop-Benachrichtigung über `notify-send`; injizierbar, fehlt das Programm, läuft der Runner still weiter.
- `systemd/agent-planner-web.service` versioniert; `justfile` mit `install` (link + enable --now, nur Rezept), `sync`, `dev`, `test`.
- State-Ordner mit Rechten 0700, Lauf-Dateien mit 0600.
- README: Betrieb/Installation, `import-environment`-Zeile für `~/.bashrc` (nur dokumentiert), `Persistent=true` holt verpasste Läufe nach, Token im User-Manager.

## Entscheidungen
- Vorlagen werden über `listTemplates(templatesDir())` aus `src/templates.ts` (#5) gelesen, mit derselben Ordnerauflösung wie `/agents/new` (ctx.templatesDir, `AGENT_PLANNER_TEMPLATES`, `<repo>/templates`). Fehlt der Ordner, entfällt der Abschnitt.
- Benachrichtigung nur bei Fehlern (#1, Q11); Text gekürzt auf 200 Zeichen.
- Rechte werden für bestehende Agent-Ordner und `runs.jsonl` nachgezogen (`chmod`), weil frühere Versionen mit 0755/0644 angelegt haben. Der Basisordner wird nicht geändert (kann per `AGENT_PLANNER_STATE` fremd sein).
- Warnung für nie feuernde Daten (`*-02-31`) gehört ins Speichern-Formular (#5) bzw. `cron.ts` und ist nicht Teil dieses Changes; Folge-Hinweis.

## Berührte Dateien
- `templates/claude-code-news.md`, `templates/wochenrueckblick.md`, `templates/repo-lage.md`, `templates/ai-news.md`
- `src/web/routes/overview.ts`, `public/css/templates.css`
- `src/runner.ts`, `src/log.ts`
- `systemd/agent-planner-web.service`, `justfile`, `README.md`
- `test/web/templates.test.ts`, `test/web/overview-next.test.ts`, `test/runner.test.ts`, `test/log.test.ts`
- `openspec/changes/6-betrieb/**`, `docs/belege/6-vorlagen.png`
