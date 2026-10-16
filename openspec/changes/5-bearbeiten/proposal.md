# Vorschlag: 5-bearbeiten

Issue: #5 (Slice 4 „Bearbeiten“, Karte #1), dazu Fix #7 (Units archivierter/gelöschter Agenten aufräumen) und der Zusatz aus dem Review von #3 (CSRF-/DNS-Rebinding-Schutz).

## Warum
Agenten sollen sich im Browser anlegen, ändern, pausieren, archivieren und von Hand starten lassen, ohne die `.md` von Hand zu pflegen. `sync` ließ bisher Timer verwaister Agenten weiterlaufen (#7). Jede fremde Webseite konnte per Formular `POST /agents` und `/run` auslösen — das ist Code-Ausführung im Auto Mode.

## Was sich ändert
- Formular `GET /agents/new` (optional `?template=<slug>`), `POST /agents`, `GET /agents/:slug/edit`, `POST /agents/:slug`: Name (→ Slug, Kollision geprüft), Cron mit Live-Prüfung (`GET /cron/check`), Projekt/cwd (Vorgabe `AGENT_PLANNER_DEFAULT_CWD`, Existenz geprüft), Modell, Prompt, aufklappbare Grenzen (30/100/50). Serverseitige Validierung, Fehler am Feld.
- Nach dem Speichern: Datei atomar schreiben (unbekannte Frontmatter-Schlüssel bleiben erhalten), `sync` nur für diesen Agenten.
- `POST /agents/:slug/toggle` (enabled + Timer), `/archive` (Datei nach `_archiv/`, Timer und Drop-in weg, Logs bleiben), `/run` (manual-Marker + `systemctl --user start --no-block agent-planner@<slug>.service`).
- Antworten: htmx → `HX-Redirect`/`HX-Refresh`; Validierungsfehler → Formular-Fragment mit Status 200 (htmx tauscht 4xx nicht).
- #7: `syncUnits` entfernt Timer und Drop-ins von Slugs ohne Agent (`prune`, Vorgabe an; der Einzel-Sync aus dem Web schaltet es ab). `removeUnits(slug)` für das Archivieren.
- Schutz (`src/web/guard.ts`, von `createApp` vor allen Routen eingehängt, auch vor `/css` und `/vendor`): (a) alle Methoden: `Host` = `127.0.0.1:<port>` oder `localhost:<port>` (gegen DNS-Rebinding; ohne Host-Header nur GET/HEAD, das ist `app.request` im Prozess), (b) nicht GET: `Origin`/`Sec-Fetch-Site` falls gesetzt same-origin, (c) nicht GET: `HX-Request: true` Pflicht. Verstoß → 403. Formulare senden deshalb per `hx-post`, ohne reinen Formular-Fallback.
- Platzhalter `zz-platzhalter.ts` entfällt.

## Nachträge aus dem Review
- Guard nicht mehr als Routenmodul `_guard.ts`, sondern in `createApp` (Test: Routendatei `1-x.ts` ist geschützt).
- `sync` räumt auf und schreibt das Template nur, wenn das `--dir` im vorhandenen `ExecStart` dem aktuellen Ordner entspricht oder noch kein Template existiert; sonst Abbruch mit Meldung, `agent-planner sync --force` übersteuert.
- Schreib- und Sync-Fehler werden getrennt gemeldet; bei Schreibfehler keine Weiterleitung. Anlegen schreibt exklusiv (link(2), nie überschreiben).
- Slugs `new` und `edit` sind reserviert, höchstens 64 Zeichen.
- Vorlage: deren `cwd` gewinnt gegen `AGENT_PLANNER_DEFAULT_CWD`.
- Bearbeiten einer unlesbaren Datei: neu geschrieben, Agent bleibt pausiert.
- Globaler Toast für `htmx:responseError`/`htmx:sendError` in `layout.ts`, Stil `public/css/toast.css`. Beleg `docs/belege/5-toast.png` (Browser per CDP, Klick auf „Jetzt ausführen“ gegen ein scheiterndes Fake-systemctl).

## Entscheidungen
- **Units im Demo-/Screenshot-Betrieb:** `AGENT_PLANNER_UNIT_DIR` setzt den Unit-Ordner, `AGENT_PLANNER_SYSTEMCTL` ersetzt das Kommando `systemctl` (z. B. `echo`, aufgerufen als `<cmd> --user …`). Ist `AGENT_PLANNER_DEMO` gesetzt und kein Unit-Ordner angegeben, nimmt die App `$TMPDIR/agent-planner-demo-units` und ein No-op-systemctl — `just dev` fasst also nie echte Units an. Tests injizieren `unitDir`/`systemctl` über den Ctx.
- Erweiterungen am Ctx sind optionale Felder (`EditCtx` in `src/actions.ts`); `ctx.ts` bleibt unberührt.
- Port für die Host-Prüfung: `ctx.port` oder Env `AGENT_PLANNER_PORT`, Vorgabe 4317.
- Slug neuer Agenten: `[a-z0-9_-]`, aus dem Namen abgeleitet (ä→ae …). Zusätzlich Pfadprüfung gegen den Agentenordner.
- Kein Umbenennen des Slugs beim Bearbeiten.

## Berührte Dateien
- `src/web/routes/agent-edit.ts`, `src/web/guard.ts`, `src/actions.ts`, `src/templates.ts`, `src/units.ts`, `bin/agent-planner` (nur `--force`)
- `src/web/app.ts` (Guard einhängen), `src/web/layout.ts` (Toast)
- `public/css/form.css`, `public/css/toast.css`
- `src/web/routes/zz-platzhalter.ts` (gelöscht)
- `test/web/edit.test.ts`, `test/web/edit-guard.test.ts`, `test/actions.test.ts`, `test/templates.test.ts`, `test/units.test.ts`, `test/web-app.test.ts` (nur Hunk zu `/agents/new`/Platzhalter)
- `docs/belege/5-formular.png`, `docs/belege/5-fehler.png`, `docs/belege/5-toast.png`
- `openspec/changes/5-bearbeiten/**`
