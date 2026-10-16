# web-service

## ADDED Requirements

### Requirement: Benutzerdienst der Web-App
Das Repo SHALL eine Unit `systemd/agent-planner-web.service` enthalten, die die App mit absolutem bun-Pfad auf Port 4317 startet, Agentenordner und Vorgabe-cwd aus dem Vault setzt und bei Fehler neu startet.

#### Scenario: Unit-Inhalt
- **WHEN** die Unit gelesen wird
- **THEN** enthält sie `Type=simple`, `Restart=on-failure`, `AGENT_PLANNER_DIR=%h/git/notes-vault/agents`, `AGENT_PLANNER_DEFAULT_CWD=%h/git/notes-vault`, `AGENT_PLANNER_PORT=4317`, ein `WorkingDirectory` und ein absolutes `ExecStart`

### Requirement: Installation per justfile
Das `justfile` SHALL die Rezepte `install` (`systemctl --user link` und `enable --now`), `sync`, `dev` und `test` anbieten.

#### Scenario: Rezepte
- **WHEN** `just --summary` läuft
- **THEN** enthält die Ausgabe dev, install, sync und test
