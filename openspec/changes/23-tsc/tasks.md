# Aufgaben

- [x] 1. OpenSpec-Change anlegen und validieren (`openspec validate 23-tsc`)
- [x] 2. `typescript` als devDependency, `tsconfig.json` (strict, noEmit, bundler, bun-types) für `src/`, `bin/`, `test/`
- [x] 3. `justfile`: `typecheck` und `test` → `typecheck`, dann `bun test`
- [x] 4. Gate: absichtlicher Typfehler in `src/` → `just test` rot, ohne dass `bun test` läuft; Fehler wieder entfernt
- [x] 5. Bestehende Typfehler beheben (`src/web/server.ts`, `test/web-app.test.ts`, `test/web/edit-guard.test.ts`), ohne `any`/`@ts-ignore`
- [x] 6. `just test` grün (Typprüfung und Suite, 216/0)
