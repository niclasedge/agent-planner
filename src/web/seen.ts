import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord } from "../log";

/** `seen.json` im State-Ordner: Slug -> Startzeit (ISO) des jüngsten gelesenen Laufs. */
export type Seen = Record<string, string>;

const file = (stateDir: string) => join(stateDir, "seen.json");

export function readSeen(stateDir: string): Seen {
  try {
    const v = JSON.parse(readFileSync(file(stateDir), "utf8"));
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, s]) => typeof s === "string")) as Seen;
  } catch {
    return {};
  }
}

const time = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);

/** Hebt die Marke für `slug` auf `start`, senkt sie nie. Schreibt atomar (tmp + rename). */
export function markSeen(stateDir: string, slug: string, start: string): void {
  const seen = readSeen(stateDir);
  if (time(seen[slug]) >= time(start)) return;
  seen[slug] = start;
  mkdirSync(stateDir, { recursive: true });
  const tmp = `${file(stateDir)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(seen, null, 2) + "\n");
  renameSync(tmp, file(stateDir));
}

/** Ungelesen = beendet und jünger als die Marke (ohne Marke: jeder beendete Lauf). */
export function isUnread(run: Pick<RunRecord, "start" | "status">, mark: string | undefined): boolean {
  if (run.status === "running") return false;
  return mark === undefined || !(time(run.start) <= time(mark));
}
