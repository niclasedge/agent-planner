# Vorschlag: 13-cron-warnung

Issue: #13 (entdeckt bei #6, Review von #2), Karte #1.

## Warum
Ein Zeitplan wie `0 9 31 2 *` (31. Februar) übersetzt sich zu `*-02-31 09:00:00`. `systemd-analyze calendar` nimmt den Ausdruck an (Exit 0), der Timer feuert aber nie. Bisher meldet weder das Formular noch die CLI etwas — der Agent sieht eingeplant aus und läuft nicht.

## Was sich ändert
- `src/cron.ts`: `hasNextElapse(onCalendar, run?)` ruft `systemd-analyze calendar --iterations=1 <expr>` auf und liest die Zeile `Next elapse:`. Gemessen mit systemd 261: Ausgabe `    Next elapse: never` bei Exit 0 für `*-02-31 09:00:00`; die Ausgabe ist nicht lokalisiert. `run` ist injizierbar (Tests). `cronWarning(expr, run?)` liefert die Warnung als Text oder `undefined` (auch bei ungültigem Ausdruck — das bleibt Sache der bestehenden Prüfung). `cronWarnings(items, run?)` liefert die Warnungen für eine Liste von Agenten (für `sync`).
- Formular (`src/web/routes/agent-edit.ts`): `/cron/check` und der Hinweis unter dem Cron-Feld zeigen bei nie feuerndem Ausdruck eine Warnung (Klasse `af-hint--warn`, gelb) statt der grünen Übersetzung. Speichern ist erlaubt; ist der gespeicherte Plan nie feuernd, leitet die App statt auf die Detailseite auf `/agents/<slug>/edit?saved=1` und zeigt dort „Gespeichert“ mit der Warnung als Hinweisbox (`notice--warn`).
- CLI: `validate-cron` und `sync` sollen die Warnung auf stderr ausgeben. `bin/agent-planner` gehört während dieses Changes zu #8 und wird hier nicht angefasst; die Funktionen liegen in `src/cron.ts`, die nötigen Zeilen in bin stehen unten.

## Entscheidungen
- **Warnung, nicht Fehler.** Der Ausdruck ist syntaktisch gültig und systemd nimmt ihn an; „feuert nie“ ist eine Eigenschaft des Kalenders, kein Eingabefehler. Ein bewusst pausierter Plan (ein Datum, das nie kommt) ist ein legitimer Zustand, ebenso ein Plan, der heute nie feuert, weil das Datum zu einem anderen Jahr gehört. Ein Fehler würde das Speichern sperren und den Nutzer zwingen, den Plan umzuschreiben, obwohl der Aktiv-Schalter nichts anderes leistet. Deshalb: sichtbar warnen, nicht blockieren. Die CLI beendet sich aus demselben Grund mit Exit 0.
- Ermittelt wird über `systemd-analyze` selbst statt über eine eigene Kalenderlogik: dieselbe Instanz, die den Timer später auswertet, entscheidet auch über die Warnung (Schaltjahre, Monatslängen).
- Schlägt `systemd-analyze` fehl (Exit ≠ 0), gibt es keine Warnung — die Ablehnung meldet bereits `validateOnCalendar`.
- `src/actions.ts` (`checkCron`) bleibt unverändert; das Formular ergänzt die Warnung in `agent-edit.ts`.

## Nötige Zeilen in `bin/agent-planner` (Übergabe an #8 bzw. Folgeschritt)
- `validate-cron`, nach der Prüfung: `const w = await cronWarning(arg); if (w) console.error(\`Warnung: ${w}\`);`
- `sync`, nach `syncUnits`: `for (const w of await cronWarnings(agents)) console.error(\`Warnung: ${w}\`);` (dafür `loadAgents(dir)` in eine Variable `agents`)
- Import: `cronWarning, cronWarnings` aus `../src/cron`.

## Berührte Dateien
- `src/cron.ts`, `src/web/routes/agent-edit.ts`, `public/css/form.css`
- `test/cron.test.ts`, `test/web/edit.test.ts`
- `docs/belege/13-warnung.png`
- `openspec/changes/13-cron-warnung/**`
