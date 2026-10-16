# unit-quoting

## ADDED Requirements

### Requirement: Pfade in ExecStart nach systemd-Regeln kodiert
Das Template `agent-planner@.service` SHALL jedes Wort in `ExecStart` so schreiben, dass systemd genau den ursprünglichen Pfad erhält: `%` als `%%`, in Argumenten `$` als `$$`, Wörter mit Leerraum, `"`, `'` oder `\` in doppelten Anführungszeichen mit maskiertem `\` und `"`. Wörter ohne Sonderzeichen SHALL unverändert bleiben. Pfade mit Steuerzeichen SHALL abgelehnt werden.

#### Scenario: Agentenordner mit Leerzeichen und Prozentzeichen
- **WHEN** `sync` mit einem Agentenordner `…/ag ent %x $y` und einem Programm in einem Ordner mit Leerzeichen und `%` läuft
- **THEN** steht `--dir "…/ag ent %%x $$y"` in `ExecStart`, das Programm gequotet mit `%%` und wörtlichem `$`, und `systemd-analyze verify` auf eine Instanz der erzeugten Unit im tmp-Ordner endet mit Exit 0

#### Scenario: Pfade ohne Sonderzeichen
- **WHEN** das Template mit `/opt/agent-planner/bin/agent-planner` erzeugt wird
- **THEN** lautet die Zeile `ExecStart=/opt/agent-planner/bin/agent-planner run %i`

#### Scenario: Steuerzeichen
- **WHEN** ein Pfad einen Zeilenumbruch enthält
- **THEN** bricht `sync` mit einem Fehler ab und schreibt keine Unit

### Requirement: PATH-Zuweisung kodiert
Die Zeile `Environment=PATH=…` SHALL den bun-Ordner mit `%%` für `%` schreiben und die Zuweisung in doppelte Anführungszeichen setzen, wenn sie Leerraum, `"`, `'` oder `\` enthält; `%h/.local/bin` bleibt Platzhalter.

#### Scenario: bun-Ordner mit Leerzeichen
- **WHEN** der bun-Ordner `/a b/%x` ist
- **THEN** lautet die Zeile `Environment="PATH=/a b/%%x:%h/.local/bin:/usr/local/bin:/usr/bin"`

### Requirement: Stabiler bun-Pfad
`syncUnits` SHALL einen mise-bun-Pfad `…/installs/bun/<version>/bin/bun` im Programm und im `PATH` durch `…/installs/bun/latest/bin/bun` ersetzen, wenn `latest` auf dieselbe Datei zeigt; sonst SHALL der Pfad bleiben.

#### Scenario: latest zeigt auf die laufende Version
- **WHEN** `sync` mit `…/bun/9.9.9/bin/bun` läuft und `latest` auf `9.9.9` zeigt
- **THEN** enthalten `ExecStart` und `PATH` `…/bun/latest/bin`

#### Scenario: latest zeigt auf eine andere Version oder fehlt
- **WHEN** `latest` fehlt oder auf eine andere Version zeigt
- **THEN** bleibt der versionierte Pfad stehen

### Requirement: Ordner-Schutz mit kodiertem Agentenordner
Der Ordner-Schutz SHALL den Agentenordner in kodierter Form vergleichen, so dass ein erneuter `sync` mit demselben Ordner mit Sonderzeichen nicht abbricht und ein anderer Ordner weiter abbricht.

#### Scenario: gleicher Ordner mit Leerzeichen
- **WHEN** `sync` zweimal mit `/v a/%x` läuft
- **THEN** bricht der zweite Lauf nicht ab und ändert nichts
