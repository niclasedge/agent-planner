# Vorschlag: 4-detail

Issue: #4 (Karte #1). Detailansicht eines Agenten mit Verlauf, Lauf-Detail und Lesestatus.

## Warum
Die Übersicht (#3) zeigt nur den letzten Lauf. Wer wissen will, was ein Agent getan hat, braucht den Verlauf, das Ergebnis eines Laufs und seine Werkzeugaufrufe. Ungelesene und fehlgeschlagene Läufe sollen ohne Suchen auffallen (Entscheidung Q10, Q11).

## Was sich ändert
- `GET /agents/:slug`: Kopf mit Titel, Aktiv-Schalter, Pille „Aktiv“/„Pausiert“, nächster Ausführung; Stift, Papierkorb, „Jetzt ausführen“. Links „Verlauf“ (neueste zuerst, „· Manuell“, blauer Punkt ungelesen, roter Punkt Fehler), rechts Anweisungen (Markdown, lange Prompts ausgeblendet), Projekt, Wiederholung, Berechtigungen, Grenzen.
- `GET /agents/:slug/runs/:runId`: Lauf-Detail im rechten Bereich (htmx-Fragment, eigene URL per `hx-push-url`; ohne htmx ganze Seite). Ergebnis als Markdown, Kennzahlen, aufklappbare Werkzeugaufrufe aus `<runId>.jsonl`. Laufender Lauf pollt alle 3 s.
- Lesestatus `seen.json` im State-Ordner (Hochwassermarke je Slug: Startzeit des jüngsten gelesenen Laufs). Öffnen eines Laufs markiert ihn gelesen.
- Sidebar: blauer Punkt bei ungelesenem Lauf, roter Punkt bei fehlgeschlagenem letztem Lauf.
- Markdown über `marked`, rohes HTML wird escaped, nur `http(s)`/`mailto`/relative Links, Bilder als Link.

## Schnittstelle zu #5
Die Knöpfe senden `GET /agents/:slug/edit`, `hx-post` auf `/agents/:slug/toggle`, `/archive` (mit `hx-confirm`) und `/run`. #5 implementiert die Endpunkte und antwortet mit `HX-Refresh`/`HX-Redirect`. `/agents/new` wird mit `next()` durchgereicht.

## Entscheidungen
- Lauf-Detail als Fragment im rechten Bereich (Things-Gefühl, Verlauf bleibt stehen), Verlauf und Sidebar werden per `hx-swap-oob` mitgeschickt, damit Punkte sofort verschwinden.
- Lesestatus als Hochwassermarke statt Menge gelesener IDs: kleine Datei, ältere Läufe gelten mit als gelesen.
- Ohne Eintrag in `seen.json` gelten alle beendeten Läufe als ungelesen; laufende Läufe zählen nie als ungelesen.

## Berührte Dateien
- `src/web/routes/agent-detail.ts`, `src/web/seen.ts`, `src/web/markdown.ts`, `src/web/sidebar.ts`, `src/web/data.ts`
- `public/css/detail.css`
- `test/web/detail.test.ts`, `test/web/detail-markdown.test.ts`, `test/web/seen.test.ts`
- `demo/state/**` (nur neue Dateien)
- `package.json`, `bun.lock` (Abhängigkeit `marked`)
- `docs/belege/4-detail.png`, `docs/belege/4-lauf.png`
- `openspec/changes/4-detail/**`
