import { test, expect } from "bun:test";
import { formatDuration, formatRelative } from "../src/web/format";

test("formatDuration", () => {
  expect(formatDuration(400)).toBe("< 1 s");
  expect(formatDuration(42_000)).toBe("42 s");
  expect(formatDuration(190_000)).toBe("3 min 10 s");
  expect(formatDuration(180_000)).toBe("3 min");
  expect(formatDuration(3_900_000)).toBe("1 h 5 min");
  expect(formatDuration(3_600_000)).toBe("1 h");
});

const now = new Date(2026, 9, 6, 12, 0); // 6. Okt. 2026, lokal

test("formatRelative: heute, gestern, morgen", () => {
  expect(formatRelative(new Date(2026, 9, 6, 7, 9), now)).toBe("heute 07:09");
  expect(formatRelative(new Date(2026, 9, 5, 23, 59), now)).toBe("gestern 23:59");
  expect(formatRelative(new Date(2026, 9, 7, 7, 0), now)).toBe("morgen 07:00");
});

test("formatRelative: andere Tage deutsch, Jahr nur wenn abweichend", () => {
  expect(formatRelative(new Date(2026, 9, 9, 16, 0), now)).toBe("Fr, 9. Okt. 16:00");
  expect(formatRelative(new Date(2027, 0, 4, 8, 5), now)).toBe("Mo, 4. Jan. 2027 08:05");
});

test("formatRelative: ISO-String, lokale Zeitzone", () => {
  const d = new Date(2026, 9, 6, 7, 9);
  expect(formatRelative(d.toISOString(), now)).toBe("heute 07:09");
});
