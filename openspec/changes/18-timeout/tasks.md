# Aufgaben

- [x] 1. OpenSpec-Change anlegen und validieren (`openspec validate 18-timeout`)
- [x] 2. Test `test/units.test.ts` anpassen (TimeoutStartSec = Limit + 60 s, kein RuntimeMaxSec, verify ohne Filter)
- [x] 3. Test `test/runner.test.ts` ergänzen (SIGTERM bei Laufzeit = TimeoutStartSec aus limitsConf → timeout mit Benachrichtigung)
- [x] 3a. Tests `test/units.test.ts`, `test/actions.test.ts`: runnerPath als Wortliste, keine Teilung eines Strings
- [x] 4. Tests laufen rot
- [x] 5. Umsetzen: `limitsConf()` in `src/units.ts`, Kommentare in `src/runner.ts`, `runnerPath: string[]` in `src/units.ts`/`src/actions.ts`
- [x] 6. Tests grün (`bun test`)
