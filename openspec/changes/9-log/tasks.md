# Aufgaben

- [x] 1. OpenSpec-Change anlegen und validieren (`openspec validate 9-log`)
- [x] 2. Test `test/runner.test.ts` ergänzen (SIGTERM vor Limit → stopped ohne Benachrichtigung, SIGTERM am Limit → timeout, Marker-Gültigkeit 60 s, Marker bleibt bei Flag/Env)
- [x] 3. Test `test/log.test.ts` ergänzen (pidStart/bootId in der running-Zeile, abweichende Startzeit oder Boot-ID → timeout, alte Zeilen ohne Felder wie bisher)
- [x] 4. Tests laufen rot
- [x] 5. Umsetzen: `src/log.ts`, `src/runner.ts`, `STATUS_LABEL` in `src/web/data.ts`
- [x] 6. Tests grün (`bun test`)
