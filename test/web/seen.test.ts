import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "../../src/log";
import { isUnread, markSeen, readSeen } from "../../src/web/seen";

const run = (start: string, status: RunRecord["status"] = "success"): RunRecord => ({ runId: start, slug: "a", trigger: "schedule", start, status });

test("readSeen: fehlende oder kaputte Datei -> leer", () => {
  const d = mkdtempSync(join(tmpdir(), "ap-seen-"));
  expect(readSeen(d)).toEqual({});
  writeFileSync(join(d, "seen.json"), "kein json");
  expect(readSeen(d)).toEqual({});
  writeFileSync(join(d, "seen.json"), "[1,2]");
  expect(readSeen(d)).toEqual({});
});

test("markSeen schreibt seen.json, Marke steigt nur", () => {
  const d = mkdtempSync(join(tmpdir(), "ap-seen-"));
  markSeen(d, "a", "2026-10-05T05:09:00.000Z");
  markSeen(d, "b", "2026-10-01T05:09:00.000Z");
  expect(JSON.parse(readFileSync(join(d, "seen.json"), "utf8"))).toEqual({ a: "2026-10-05T05:09:00.000Z", b: "2026-10-01T05:09:00.000Z" });
  markSeen(d, "a", "2026-10-04T05:09:00.000Z"); // älterer Lauf: Marke bleibt
  expect(readSeen(d).a).toBe("2026-10-05T05:09:00.000Z");
  markSeen(d, "a", "2026-10-06T05:09:00.000Z");
  expect(readSeen(d).a).toBe("2026-10-06T05:09:00.000Z");
});

test("markSeen legt den State-Ordner bei Bedarf an", () => {
  const d = join(mkdtempSync(join(tmpdir(), "ap-seen-")), "neu");
  markSeen(d, "a", "2026-10-05T05:09:00.000Z");
  expect(readSeen(d).a).toBe("2026-10-05T05:09:00.000Z");
});

test("isUnread: beendet und jünger als Marke; laufend nie", () => {
  const mark = "2026-10-05T05:09:00.000Z";
  expect(isUnread(run("2026-10-06T05:09:00.000Z"), mark)).toBe(true);
  expect(isUnread(run("2026-10-05T05:09:00.000Z"), mark)).toBe(false);
  expect(isUnread(run("2026-10-04T05:09:00.000Z", "error"), mark)).toBe(false);
  expect(isUnread(run("2026-10-04T05:09:00.000Z"), undefined)).toBe(true);
  expect(isUnread(run("2026-10-07T05:09:00.000Z", "running"), mark)).toBe(false);
});
