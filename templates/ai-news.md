---
name: "AI-News"
cron: "0 9 * * *"
cwd: "~/git/notes-vault"
icon: "◉"
summary: "AI-News-Report im Vault täglich fortschreiben"
enabled: true
timeout: 30
maxTurns: 100
maxBudgetUsd: 50
---
Schreibe den Report `Calendar/Reports/AI-News.md` im Vault fort; lege ihn an, falls er fehlt. Recherchiere die Neuigkeiten seit dem letzten Eintrag zu KI-Modellen, Coding-Agenten, Agent-Protokollen (MCP, A2A) und KI-Sicherheit.

Füge oben einen neuen Abschnitt mit heutigem Datum ein: höchstens sieben Meldungen, je ein Satz Einordnung und ein Link zur Primärquelle. Überspringe, was schon in einem früheren Abschnitt steht. Verlinke passende Wiki-Seiten unter `Atlas/Wiki/AI/` als `[[Wiki-Link]]`, statt deren Inhalt zu wiederholen. Ältere Abschnitte bleiben unverändert. Schreibe auf Deutsch.
