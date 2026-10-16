---
name: "Wochenrückblick"
cron: "0 16 * * 5"
cwd: "~/git/notes-vault"
icon: "◷"
summary: "Daily Notes der Woche: Erledigtes, Offenes, drei Schwerpunkte"
enabled: true
timeout: 30
maxTurns: 100
maxBudgetUsd: 50
---
Lies die Daily Notes dieser Woche (Montag bis heute) aus `Calendar/Daily/` im Vault. Erstelle daraus einen Wochenrückblick auf Deutsch:

- **Erledigt:** was diese Woche abgeschlossen wurde, gruppiert nach Projekt.
- **Offen:** was angefangen, verschoben oder liegen geblieben ist, mit dem Tag, an dem es zuletzt auftauchte.
- **Drei Schwerpunkte für nächste Woche:** begründet aus dem Offenen und den wiederkehrenden Themen.

Lege das Ergebnis als `Calendar/Reports/Wochenrueckblick_<Jahr>-W<KW>.md` ab. Ändere keine bestehenden Notizen. Fehlen Daily Notes für einzelne Tage, nenne die Tage am Ende.
