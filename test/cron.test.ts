import { test, expect } from "bun:test";
import { cronToOnCalendar, cronWarning, cronWarnings, hasNextElapse, validateOnCalendar, type CalendarRun } from "../src/cron";

test("Wochentags um 08:00", () => {
  const r = cronToOnCalendar("0 8 * * 1-5");
  expect(r.onCalendar).toBe("Mon..Fri *-*-* 08:00:00");
  expect(r.human).toBe("Wochentags um 08:00");
});

test("Täglich um 07:00", () => {
  const r = cronToOnCalendar("0 7 * * *");
  expect(r.onCalendar).toBe("*-*-* 07:00:00");
  expect(r.human).toBe("Täglich um 07:00");
});

test("Jeden Freitag um 16:00", () => {
  const r = cronToOnCalendar("0 16 * * 5");
  expect(r.onCalendar).toBe("Fri *-*-* 16:00:00");
  expect(r.human).toBe("Jeden Freitag um 16:00");
});

test("Sonntag als 0 und 7", () => {
  expect(cronToOnCalendar("0 9 * * 0").onCalendar).toBe("Sun *-*-* 09:00:00");
  expect(cronToOnCalendar("0 9 * * 7").onCalendar).toBe("Sun *-*-* 09:00:00");
});

test("Listen und Bereiche bei Wochentagen", () => {
  expect(cronToOnCalendar("30 6 * * 1,3,5").onCalendar).toBe("Mon,Wed,Fri *-*-* 06:30:00");
});

test("Schritte", () => {
  expect(cronToOnCalendar("*/15 * * * *").onCalendar).toBe("*-*-* *:00/15:00");
  expect(cronToOnCalendar("0 */2 * * *").onCalendar).toBe("*-*-* 00/2:00:00");
});

test("Tag im Monat und Monat", () => {
  expect(cronToOnCalendar("0 6 1 * *").onCalendar).toBe("*-*-01 06:00:00");
  expect(cronToOnCalendar("0 6 1 1,7 *").onCalendar).toBe("*-01,07-01 06:00:00");
});

test("nicht übersetzbar", () => {
  expect(() => cronToOnCalendar("0 8 * *")).toThrow(/5 Felder/);
  expect(() => cronToOnCalendar("61 8 * * *")).toThrow(/Minute/);
  expect(() => cronToOnCalendar("0 25 * * *")).toThrow(/Stunde/);
  expect(() => cronToOnCalendar("0 8 * * 8")).toThrow(/Wochentag/);
  expect(() => cronToOnCalendar("0 8 1 * 1")).toThrow(/Tag im Monat und Wochentag/);
  expect(() => cronToOnCalendar("@daily")).toThrow();
  expect(() => cronToOnCalendar("0 8 * * MON")).toThrow(/Wochentag/);
});

test("systemd-analyze nimmt die Übersetzungen an", async () => {
  for (const e of ["0 8 * * 1-5", "*/15 * * * *", "0 6 1 1,7 *", "30 6 * * 1,3,5"]) {
    expect(await validateOnCalendar(cronToOnCalendar(e).onCalendar)).toBe(true);
  }
  expect(await validateOnCalendar("quatsch")).toBe(false);
});

test("Alle n Minuten nur wenn n die Stunde teilt", () => {
  expect(cronToOnCalendar("*/15 * * * *").human).toBe("Alle 15 Minuten");
  expect(cronToOnCalendar("*/7 * * * *").human).not.toMatch(/^Alle/);
});

test("Schritt größer als der Bereich: eigener Fehler", () => {
  expect(() => cronToOnCalendar("*/90 * * * *")).toThrow(/Minute: Schritt 90/);
  expect(() => cronToOnCalendar("0 */25 * * *")).toThrow(/Stunde: Schritt 25/);
});

// #13: gültig, aber feuert nie
const NEVER = "Normalized form: *-02-31 09:00:00\n    Next elapse: never\n";
const SOON = "Normalized form: *-*-* 07:00:00\n    Next elapse: Wed 2026-10-07 07:00:00 CEST\n       (in UTC): Wed 2026-10-07 05:00:00 UTC\n       From now: 20h left\n";
const fake = (stdout: string, code = 0) => {
  const calls: string[][] = [];
  const run: CalendarRun = async (args) => { calls.push(args); return { code, stdout }; };
  return { run, calls };
};

test("hasNextElapse liest „Next elapse: never“ (injiziert)", async () => {
  const f = fake(NEVER);
  expect(await hasNextElapse("*-02-31 09:00:00", f.run)).toBe(false);
  expect(f.calls).toEqual([["calendar", "--iterations=1", "*-02-31 09:00:00"]]);
  expect(await hasNextElapse("*-*-* 07:00:00", fake(SOON).run)).toBe(true);
  // abgelehnt: keine Aussage über den Termin, die Ablehnung meldet validateOnCalendar
  expect(await hasNextElapse("quatsch", fake("", 1).run)).toBe(true);
});

test("hasNextElapse mit echtem systemd-analyze", async () => {
  expect(await hasNextElapse(cronToOnCalendar("0 9 31 2 *").onCalendar)).toBe(false);
  expect(await hasNextElapse(cronToOnCalendar("0 9 30 2 *").onCalendar)).toBe(false);
  expect(await hasNextElapse(cronToOnCalendar("0 9 29 2 *").onCalendar)).toBe(true); // Schaltjahr
  expect(await hasNextElapse(cronToOnCalendar("0 7 * * *").onCalendar)).toBe(true);
});

test("cronWarning: Warnung nur bei nie feuerndem, gültigem Ausdruck", async () => {
  const w = await cronWarning("0 9 31 2 *", fake(NEVER).run);
  expect(w).toContain("feuert nie");
  expect(w).toContain("*-02-31 09:00:00");
  expect(await cronWarning("0 7 * * *", fake(SOON).run)).toBeUndefined();
  const f = fake(NEVER);
  expect(await cronWarning("0 8 * *", f.run)).toBeUndefined();
  expect(f.calls).toEqual([]);
  expect(await cronWarning("0 9 31 2 *")).toContain("feuert nie"); // echt
});

test("cronWarnings: je nie feuerndem Agenten eine Zeile mit Slug", async () => {
  const ws = await cronWarnings([
    { slug: "februar", cron: "0 9 31 2 *" },
    { slug: "daily", cron: "0 7 * * *" },
    { slug: "kaputt", cron: "quatsch" },
  ]);
  expect(ws).toHaveLength(1);
  expect(ws[0]).toContain("februar");
  expect(ws[0]).toContain("feuert nie");
});
