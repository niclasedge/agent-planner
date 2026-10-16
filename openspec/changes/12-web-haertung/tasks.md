# Aufgaben

- [x] 1. OpenSpec-Change anlegen und validieren
- [x] 2. Tests `test/web-app.test.ts` (`/css/%25`, `/css/a%00.css` → 404; kaputtes Routenmodul im tmp-Ordner wird übersprungen und auf stderr gemeldet) und `test/web/layout.test.ts` (reiner String mit `<script>` wird escaped, `html`-Teile und Promise-Teile bleiben HTML)
- [x] 3. Tests laufen rot
- [x] 4. Umsetzen: `src/web/app.ts`, `src/web/layout.ts`, `package.json`/`bun.lock`
- [x] 5. Tests grün (eigene, dann `bun test`)
- [x] 6. Sichtprüfung Übersicht, Detail, Formular gegen Demo-Bestand (Port 4325)
- [x] 7. Nachtrag #9: Test in `test/web-app.test.ts` (Übersicht zeigt „Gestoppt“, `.state--stopped` ohne Rot), rot
- [x] 8. Umsetzen: `src/web/routes/overview.ts` nutzt `STATUS_LABEL`, `public/css/base.css` `.state--stopped`; Tests grün
