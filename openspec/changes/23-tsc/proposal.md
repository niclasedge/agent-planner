# Vorschlag: 23-tsc

Issue: #23 (entdeckt im Review von #18/#12).

## Warum
bun führt TypeScript aus, ohne Typen zu prüfen, und `tsc` läuft nirgends. Typfehler bleiben dadurch grün — im Review von #18 etwa `runnerPath` als String statt `string[]` in Tests. `just test` soll bei einem Typfehler abbrechen.

## Was sich ändert
- `package.json`, `bun.lock`: `typescript` als devDependency (`bun add -d`); `@types/bun` war bereits da.
- `tsconfig.json` (neu): `strict`, `noEmit`, `moduleResolution: bundler`, `module: Preserve`, `types: ["bun"]`, `skipLibCheck`; Umfang `src/`, `bin/`, `test/`.
- `bin/agent-planner.ts` (neu, Symlink auf `bin/agent-planner`): `tsc` nimmt nur Dateien mit TS-Endung auf; der Symlink bringt die CLI ohne Umbau in die Prüfung. Aufruf, Unit und `import.meta.dir` bleiben unverändert.
- `justfile`: Rezept `typecheck` = `bunx tsc --noEmit`; `test` hängt von `typecheck` ab und ruft danach `bun test`.
- Bestehende Typfehler beheben, ohne Verhalten zu ändern (5 Meldungen bei der Einführung):
  - `src/web/server.ts`: `server.port` ist in bun-types `number | undefined` (Unix-Socket); bei TCP-Bind immer gesetzt → `server.port ?? port`.
  - `test/web-app.test.ts`: `app.request()` liefert `Response | Promise<Response>`; `.then` auf dem Ergebnis → `await` statt `.then`.
  - `test/web/edit-guard.test.ts`: Header-Objekte als Union mit optional-`undefined` → als `Record<string, string>` annotiert.

## Entscheidungen
- **Kein `any`, kein `@ts-ignore`.** Alle Fehler ließen sich typgenau beheben.
- **Symlink statt CLI-Umbau.** Die CLI nach `src/cli.ts` zu verschieben würde `import.meta.dir` und damit den in Units geschriebenen Skriptpfad berühren; der Symlink ändert kein Verhalten.
- **Kein echter Bug gefunden.** Alle Meldungen waren Typ-Ungenauigkeiten ohne Laufzeitfolge; deshalb kein Regressionstest.

## Berührte Dateien
- `package.json`, `bun.lock`, `tsconfig.json`, `justfile`
- `bin/agent-planner.ts` (Symlink)
- `src/web/server.ts`
- `test/web-app.test.ts`, `test/web/edit-guard.test.ts`
- `openspec/changes/23-tsc/**`
