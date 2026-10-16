# typecheck

## ADDED Requirements

### Requirement: Typprüfung als Teil von just test
`just test` SHALL zuerst `tsc --noEmit` über `src/`, `bin/` und `test/` mit `strict` ausführen und SHALL `bun test` nur starten, wenn die Typprüfung fehlerfrei ist.

#### Scenario: just test bricht bei einem Typfehler ab
- **WHEN** eine Datei unter `src/`, `bin/` oder `test/` einen Typfehler enthält
- **THEN** meldet `just test` den Fehler von `tsc`, endet mit Exit-Code ungleich 0 und führt `bun test` nicht aus

#### Scenario: Fehlerfreier Stand
- **WHEN** keine Datei einen Typfehler enthält
- **THEN** läuft `bun test` und das Ergebnis von `just test` ist das Ergebnis der Suite

#### Scenario: Typprüfung einzeln
- **WHEN** `just typecheck` aufgerufen wird
- **THEN** läuft nur `tsc --noEmit` ohne Ausgabe von Dateien
