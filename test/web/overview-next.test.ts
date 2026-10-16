import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/web/app";

// Review von #3: die Karte zeigt den nächsten Lauf, nicht nur die Sidebar.
test("Karte zeigt „Nächster Lauf“ aus nextRuns, ohne Timer „—“", async () => {
  const d = mkdtempSync(join(tmpdir(), "ap-next-"));
  mkdirSync(join(d, "agents"));
  writeFileSync(join(d, "agents", "a.md"), `---\nname: A\ncron: "0 7 * * *"\ncwd: /tmp\n---\nPrompt A`);
  writeFileSync(join(d, "agents", "b.md"), `---\nname: B\ncron: "0 8 * * *"\ncwd: /tmp\nenabled: false\n---\nPrompt B`);
  const app = await createApp({
    agentDir: join(d, "agents"), stateDir: join(d, "state"), now: () => new Date(2026, 9, 6, 12),
    nextRuns: async () => new Map([["a", new Date(2026, 9, 7, 7, 0)]]),
  });
  const h = await (await app.request("/", { headers: { "HX-Request": "true" } }, { ip: "127.0.0.1" })).text();
  const cardA = h.slice(h.indexOf('href="/agents/a"'), h.indexOf('href="/agents/b"'));
  const cardB = h.slice(h.indexOf('href="/agents/b"'));
  expect(cardA).toMatch(/Nächster Lauf<\/span>\s*morgen 07:00/);
  expect(cardB).toMatch(/Nächster Lauf<\/span>\s*—/);
});
