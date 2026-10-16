---
name: "Repo-Lage"
cron: "0 8 * * 1-5"
cwd: "~/git"
icon: "⎇"
summary: "Offene Issues und PRs aller Repos unter ~/git per gh"
enabled: true
timeout: 30
maxTurns: 100
maxBudgetUsd: 50
---
Verschaffe dir einen Überblick über die Repositories unter `~/git`: Ermittle für jedes Verzeichnis mit GitHub-Remote (`git remote get-url origin`) die offenen Issues und Pull Requests per `gh issue list --state open` und `gh pr list --state open`. Ändere nichts, nur lesen.

Fasse die Lage auf Deutsch zusammen:

1. Pull Requests, die auf Review oder Merge warten, mit Alter in Tagen und CI-Status.
2. Issues mit Label `question` oder `bug` zuerst, dann der Rest gezählt je Repo.
3. Repos ohne Bewegung seit mehr als 30 Tagen, aber mit offenen Issues.

Schreibe das Ergebnis in die heutige Daily Note unter `~/git/notes-vault/Calendar/Daily/` als Abschnitt „Repo-Lage". Repos ohne Remote oder ohne Zugriff nur am Ende auflisten.
