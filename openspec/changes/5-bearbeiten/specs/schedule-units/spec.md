# schedule-units

## ADDED Requirements

### Requirement: Verwaiste Units aufräumen
Das System SHALL beim vollständigen `sync` Timer und Drop-ins von Slugs entfernen, zu denen keine Agent-Datei mehr existiert (#7).

#### Scenario: Agent archiviert
- **WHEN** `sync` ohne den Agenten `alt` läuft, dessen Timer noch im Unit-Ordner liegt
- **THEN** wird der Timer von `alt` mit `disable --now` abgeschaltet, Timer und Drop-in gelöscht und `daemon-reload` ausgeführt

#### Scenario: Einzel-Sync
- **WHEN** `sync` mit `prune: false` für einen Agenten läuft
- **THEN** bleiben die Units anderer Agenten unberührt
