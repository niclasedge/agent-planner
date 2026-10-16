export interface CronResult {
  onCalendar: string;
  human: string;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_DE_ADV = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DOW_DE_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");

interface FieldSpec { name: string; min: number; max: number }

/** Zerlegt ein Cron-Feld in sortierte Werte (ohne Schritte-Erhalt) oder liefert die systemd-Form. */
function timeField(raw: string, f: FieldSpec): { systemd: string; values: number[] | null } {
  if (raw === "*") return { systemd: "*", values: null };
  const out: string[] = [];
  const values: number[] = [];
  let simple = true;
  for (const part of raw.split(",")) {
    const m = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`${f.name}: "${part}" ist nicht übersetzbar`);
    const star = !!m[1];
    const a = star ? f.min : Number(m[2]);
    const b = m[3] !== undefined ? Number(m[3]) : undefined;
    const step = m[4] !== undefined ? Number(m[4]) : undefined;
    for (const v of [a, b]) {
      if (v !== undefined && (v < f.min || v > f.max)) throw new Error(`${f.name}: ${v} außerhalb ${f.min}-${f.max}`);
    }
    if (b !== undefined && b < a) throw new Error(`${f.name}: Bereich ${a}-${b} ist rückwärts`);
    if (step !== undefined && (step < 1 || step > f.max - f.min + 1)) {
      throw new Error(`${f.name}: Schritt ${step} außerhalb 1-${f.max - f.min + 1}`);
    }
    if (step !== undefined) {
      simple = false;
      out.push(b !== undefined ? `${pad(a)}..${pad(b)}/${step}` : `${pad(a)}/${step}`);
    } else if (b !== undefined) {
      simple = false;
      out.push(`${pad(a)}..${pad(b)}`);
    } else {
      values.push(a);
      out.push(pad(a));
    }
  }
  return { systemd: out.join(","), values: simple ? values : null };
}

function dowField(raw: string): number[] | null {
  if (raw === "*") return null;
  const set = new Set<number>();
  for (const part of raw.split(",")) {
    const m = /^(\d)(?:-(\d))?$/.exec(part);
    if (!m) throw new Error(`Wochentag: "${part}" ist nicht übersetzbar (nur Ziffern 0-7, Listen, Bereiche)`);
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    if (a > 7 || b > 7 || b < a) throw new Error(`Wochentag: ${part} außerhalb 0-7`);
    for (let d = a; d <= b; d++) set.add(d % 7);
  }
  return [...set];
}

function dowSystemd(days: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mo zuerst
  const present = order.filter((d) => days.includes(d));
  const runs: number[][] = [];
  for (const d of present) {
    const last = runs[runs.length - 1];
    if (last && order.indexOf(d) === order.indexOf(last[last.length - 1]) + 1) last.push(d);
    else runs.push([d]);
  }
  return runs
    .map((r) => (r.length >= 3 ? `${DOW[r[0]]}..${DOW[r[r.length - 1]]}` : r.map((d) => DOW[d]).join(",")))
    .join(",");
}

function humanDow(days: number[] | null): string | null {
  if (days === null || days.length === 7) return "Täglich";
  const s = [...days].sort().join(",");
  if (s === "1,2,3,4,5") return "Wochentags";
  if (s === "0,6") return "Am Wochenende";
  if (days.length === 1) return `Jeden ${DOW_DE_ADV[days[0]]}`;
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => DOW_DE_SHORT[d]).join(", ");
}

export function cronToOnCalendar(expr: string): CronResult {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Cron braucht genau 5 Felder, gefunden ${fields.length}: "${expr}"`);
  const [mi, ho, dm, mo, dw] = fields;
  const minute = timeField(mi, { name: "Minute", min: 0, max: 59 });
  const hour = timeField(ho, { name: "Stunde", min: 0, max: 23 });
  const dom = timeField(dm, { name: "Tag im Monat", min: 1, max: 31 });
  const month = timeField(mo, { name: "Monat", min: 1, max: 12 });
  const days = dowField(dw);
  const allDays = days !== null && days.length === 7;
  if (dm !== "*" && days !== null && !allDays) {
    throw new Error("Tag im Monat und Wochentag gleichzeitig sind in Cron eine ODER-Verknüpfung und nicht übersetzbar");
  }

  const date = `*-${month.systemd}-${dom.systemd}`;
  const time = `${hour.systemd}:${minute.systemd}:00`;
  const dowPart = days !== null && !allDays ? `${dowSystemd(days)} ` : "";
  const onCalendar = `${dowPart}${date} ${time}`;

  let human: string;
  const single = minute.values?.length === 1 && hour.values?.length === 1;
  if (single && dm === "*" && mo === "*") {
    human = `${humanDow(allDays ? null : days)} um ${pad(hour.values![0])}:${pad(minute.values![0])}`;
  } else if (/^\*\/\d+$/.test(mi) && 60 % Number(mi.slice(2)) === 0 && ho === "*" && dm === "*" && mo === "*" && dw === "*") {
    human = `Alle ${mi.slice(2)} Minuten`;
  } else {
    human = `Zeitplan ${expr.trim()}`;
  }
  return { onCalendar, human };
}

export async function validateOnCalendar(onCalendar: string): Promise<boolean> {
  const p = Bun.spawn(["systemd-analyze", "calendar", onCalendar], { stdout: "ignore", stderr: "ignore" });
  return (await p.exited) === 0;
}

/** Ruft `systemd-analyze <args>` auf; injizierbar für Tests. */
export type CalendarRun = (args: string[]) => Promise<{ code: number; stdout: string }>;

const systemdAnalyze: CalendarRun = async (args) => {
  const p = Bun.spawn(["systemd-analyze", ...args], { stdout: "pipe", stderr: "ignore" });
  const stdout = await new Response(p.stdout).text();
  return { code: await p.exited, stdout };
};

/**
 * Hat der Ausdruck einen nächsten Termin? systemd-analyze nimmt z. B. `*-02-31` an (Exit 0),
 * meldet aber `Next elapse: never`. Lehnt systemd den Ausdruck ab, gilt er hier nicht als „nie“ —
 * das meldet validateOnCalendar.
 */
export async function hasNextElapse(onCalendar: string, run: CalendarRun = systemdAnalyze): Promise<boolean> {
  const r = await run(["calendar", "--iterations=1", onCalendar]);
  if (r.code !== 0) return true;
  const m = /^\s*Next elapse:\s*(.+)$/m.exec(r.stdout);
  return !m || m[1].trim() !== "never";
}

/** Warnung für einen gültigen Cron-Ausdruck, der nie feuert; sonst undefined. */
export async function cronWarning(expr: string, run?: CalendarRun): Promise<string | undefined> {
  let onCalendar: string;
  try {
    onCalendar = cronToOnCalendar(expr).onCalendar;
  } catch {
    return undefined;
  }
  if (await hasNextElapse(onCalendar, run)) return undefined;
  return `Zeitplan feuert nie: systemd findet keinen nächsten Termin für „${onCalendar}“`;
}

/** Warnungen für `sync`: je Agent mit nie feuerndem Zeitplan eine Zeile mit Slug. */
export async function cronWarnings(agents: { slug: string; cron: string }[], run?: CalendarRun): Promise<string[]> {
  const out: string[] = [];
  for (const a of agents) {
    const w = await cronWarning(a.cron, run);
    if (w) out.push(`Agent "${a.slug}": ${w}`);
  }
  return out;
}
