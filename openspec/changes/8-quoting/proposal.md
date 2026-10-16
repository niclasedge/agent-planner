# Vorschlag: 8-quoting

Issue: #8 (entdeckt im Review von #2, Ergänzung aus dem Review von #6).

## Warum
`sync` schreibt Programm, Skript, `--dir` und den bun-Ordner ungequotet in `agent-planner@.service`. Ein Leerzeichen, ein `%` oder ein `$` im Pfad zerlegt das Kommando oder lässt systemd einen Platzhalter auflösen; die Unit bricht laut (keine Injection, die Pfade kommen nicht aus dem Frontmatter). Dazu schreibt `sync` den versionierten bun-Pfad (`…/mise/installs/bun/1.4.2/bin/bun`, `process.execPath`), die Web-Unit dagegen `…/bun/latest/bin/bun`. Nach einem bun-Update laufen die Timer ins Leere, die Web-App nicht.

## Was sich ändert
- `src/units.ts` kodiert jedes Wort in `ExecStart` und die `PATH`-Zuweisung nach den systemd-Regeln: `%` → `%%`; in Argumenten `$` → `$$`; Wörter mit Leerraum, `"`, `'` oder `\` in doppelte Anführungszeichen, darin `\` und `"` mit `\` maskiert; Steuerzeichen werden abgelehnt. Pfade ohne Sonderzeichen bleiben wörtlich, die bestehende Unit ändert sich dadurch nicht.
- `runnerPath` nimmt eine Wortliste (`[bun, skript]`); ein String bleibt erlaubt (ein Wort oder `<process.execPath> <skript>`, so baut ihn `src/actions.ts`).
- `syncUnits` ersetzt einen mise-bun-Pfad durch den `latest`-Pfad, wenn `latest` auf dieselbe Datei zeigt; sonst bleibt der Pfad. Gilt für Programm und `PATH`, für CLI-`sync` und Web-Sync gleich.
- Der Ordner-Schutz vergleicht `--dir` in kodierter Form.
- `bin/agent-planner` übergibt `[process.execPath, skript]` statt eines zusammengefügten Strings.
- `just install` startet den Dienst zusätzlich neu; README nennt das und dass die Web-Unit den GitButler-Workspace ausliefert.

## Entscheidungen
- **`latest`-Symlink statt `command -v bun` oder `execPath`.** Die Web-Unit nutzt schon `latest`, mise zieht den Link bei jeder Installation nach. `command -v bun` hängt an der Shell, aus der `sync` läuft, und liefert mit aktiviertem mise einen Shim, den systemd ohne mise-Umgebung nicht auflösen kann. `latest` gilt nur, wenn es auf dieselbe Datei zeigt wie der laufende bun: Läuft `sync` mit einer älteren, angepinnten Version, bleibt deren Pfad stehen, statt still eine andere Version einzutragen. Ohne mise (kein `…/installs/bun/<version>/bin/bun`) bleibt `execPath`.
- **Die Stabilisierung liegt in `syncUnits`, nicht im Aufrufer.** Der Web-Sync (`src/actions.ts`) und die CLI schreiben dasselbe Template; würden sie verschiedene Pfade eintragen, schriebe jeder Sync das Template neu und löste `daemon-reload` aus. `src/actions.ts` gehört nicht zu diesem Change, deshalb versteht `runnerPath` weiter den String `<execPath> <skript>`.
- **Das Programm (erstes Wort) bekommt kein `$$`.** systemd expandiert dort keine Variablen; `$$` bliebe wörtlich stehen (geprüft mit `systemd-analyze verify`, Meldung `…$$y/bun is not executable`). `Environment=` expandiert ebenfalls nicht, dort nur `%%`.
- **Minimal quoten.** Nur Wörter mit Sonderzeichen bekommen Anführungszeichen; so bleiben bestehende Templates und die Tests unverändert gültig, und der Ordner-Schutz erkennt alte Templates wieder.
- Ein `:` im bun-Ordner lässt sich in `PATH` nicht ausdrücken; das bleibt außen vor.

## Berührte Dateien
- `src/units.ts`, `bin/agent-planner`
- `systemd/agent-planner-web.service`, `justfile`, `README.md`
- `test/units.test.ts`, `test/cli.test.ts`
- `openspec/changes/8-quoting/**`
