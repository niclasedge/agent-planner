---
name: "Claude-Code-News"
cron: "0 7 * * *"
cwd: "~/git/notes-vault"
icon: "✦"
summary: "Briefing zu Claude-Code-Änderungen der letzten 14 Tage"
enabled: true
timeout: 30
maxTurns: 100
maxBudgetUsd: 50
---
Recherchiere die Änderungen an Claude Code aus den letzten 14 Tagen: Release Notes und CHANGELOG von anthropics/claude-code, die offizielle Dokumentation (neue oder geänderte Seiten) sowie Ankündigungen von Anthropic. Fasse sie als Briefing für einen Entwickler zusammen, der Claude Code täglich mit Skills, Hooks, Subagenten und dem Agent SDK nutzt:

1. Die drei wichtigsten Neuerungen, je zwei Sätze, mit Versionsnummer und Quelle.
2. Breaking Changes oder geänderte Vorgaben, die bestehende Skills, Hooks oder Einstellungen betreffen.
3. Was sich konkret ausprobieren lohnt.

Schreibe das Briefing auf Deutsch in die heutige Daily Note unter `Calendar/Daily/` als Abschnitt „Claude-Code-News". Gibt es nichts Neues, schreibe genau das. Keine Spekulation, nur belegte Änderungen mit Link.
