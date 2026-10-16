# run-log

## ADDED Requirements

### Requirement: Prozess-Identität der running-Zeile
Die `running`-Zeile SHALL neben `pid` die Startzeit des Prozesses (`pidStart`, Feld 22 aus `/proc/<pid>/stat`) und die Boot-ID (`bootId`) enthalten, sofern lesbar. Der Leser SHALL einen Lauf ohne Endzeile als tot werten (`timeout`), wenn die aktuelle Boot-ID oder die Startzeit des Prozesses mit dieser PID abweicht oder der Prozess fehlt. Fehlen die Felder, gilt allein der Lebendtest der PID.

#### Scenario: PID wiederverwendet
- **WHEN** ein Prozess mit der PID lebt, aber eine andere Startzeit hat
- **THEN** meldet der Leser den Status timeout

#### Scenario: Neustart
- **WHEN** die Boot-ID der Zeile von der aktuellen abweicht
- **THEN** meldet der Leser den Status timeout

#### Scenario: Lauf lebt
- **WHEN** PID, Startzeit und Boot-ID passen
- **THEN** meldet der Leser den Status running
