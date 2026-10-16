const pad = (n: number) => String(n).padStart(2, "0");
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MON = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

export function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1 s";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "heute 07:09", "gestern …", "morgen …", sonst "Fr, 9. Okt. 16:00"; lokale Zeitzone. */
export function formatRelative(when: Date | string, now: Date): string {
  const d = typeof when === "string" ? new Date(when) : when;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = Math.round((dayStart(d) - dayStart(now)) / 86_400_000);
  if (diff === 0) return `heute ${time}`;
  if (diff === -1) return `gestern ${time}`;
  if (diff === 1) return `morgen ${time}`;
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${WD[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}${year} ${time}`;
}
