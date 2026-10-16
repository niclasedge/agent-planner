# Aufgaben

- [x] 1. OpenSpec-Change anlegen und validieren
- [x] 2. Regressionstest #7 in `test/units.test.ts` (prune, removeUnits)
- [x] 3. Test `test/templates.test.ts` (listTemplates, loadTemplate, Slug-Prüfung)
- [x] 4. Test `test/actions.test.ts` (slugify, Validierung, Speichern, Toggle, Archiv, Run, Pfad-Sicherheit)
- [x] 5. Test `test/web/edit.test.ts` (Formular, Vorlage, Anlegen, Fehler am Feld, Bearbeiten, Toggle/Archiv/Run, /cron/check, new vor :slug)
- [x] 6. Test `test/web/edit-guard.test.ts` (Host, Origin/Sec-Fetch-Site, HX-Request → 403)
- [x] 7. Tests laufen rot
- [x] 8. Umsetzen: `src/units.ts`, `src/templates.ts`, `src/actions.ts`, `src/web/routes/_guard.ts`, `src/web/routes/agent-edit.ts`, `public/css/form.css`, Platzhalter löschen
- [x] 9. Tests grün (eigene, dann `bun test`)
- [x] 10. Screenshots `docs/belege/5-formular.png`, `docs/belege/5-fehler.png`
- [x] 11. Review: Regressionstests (Guard in createApp, Host für alle Methoden, Ordner-Schutz, Fehler getrennt, Toast, reservierte Slugs, exklusives Anlegen, Vorlagen-cwd) in `test/units.test.ts`, `test/actions.test.ts`, `test/web/edit.test.ts`, `test/web/edit-guard.test.ts`
- [x] 12. Review: Fixes, Beleg `docs/belege/5-toast.png`
