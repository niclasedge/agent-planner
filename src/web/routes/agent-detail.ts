import { html, raw } from "hono/html";
import type { Context, Hono, Next } from "hono";
import { cronToOnCalendar } from "../../cron";
import { listRuns, type RunRecord } from "../../log";
import type { Ctx } from "../ctx";
import { isFailed, loadOverview, readRunDetail, sortCards, STATUS_LABEL, type AgentCard } from "../data";
import { formatDuration, formatRelative } from "../format";
import { layout } from "../layout";
import { renderMarkdown } from "../markdown";
import { isUnread, markSeen, readSeen } from "../seen";
import { sidebar } from "../sidebar";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const LONG_PROMPT = 600;
const pad = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n: number) => String(n).replace(".", ",");

/** "heute um 07:09", "4. Okt. um 07:08"; mit `weekday` "Fr, 9. Okt. um 16:00". */
export function atLabel(when: Date | string, now: Date, weekday = false): string {
  const s = formatRelative(when, now).replace(/ (\d\d:\d\d)$/, " um $1");
  return weekday ? s : s.replace(/^[A-Z][a-z], /, "");
}

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const usd = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

const ICON = {
  pencil: raw(`<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>`),
  trash: raw(`<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>`),
  play: raw(`<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 4.5v15l13-7.5Z"/></svg>`),
  folder: raw(`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/></svg>`),
  repeat: raw(`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>`),
  shield: raw(`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6Z"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke-linecap="round"/></svg>`),
  gauge: raw(`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M12 2v3"/></svg>`),
};

function head(c: AgentCard, now: Date) {
  const a = c.agent;
  const base = `/agents/${a.slug}`;
  const on = !c.paused;
  const next = on ? (c.next ? `Nächste Ausführung: ${atLabel(c.next, now, true)}` : "Kein Timer eingerichtet") : "";
  return html`<header class="detail-head">
  <div class="detail-head__main">
    <h1 class="page-title">${a.name}</h1>
    <div class="detail-head__state">
      <button type="button" class="switch${on ? " is-on" : ""}" role="switch" aria-checked="${on ? "true" : "false"}" aria-label="Aktiv" hx-post="${base}/toggle" hx-swap="none"><span class="switch__knob"></span></button>
      <span class="pill ${on ? "pill--active" : "pill--paused"}">${on ? "Aktiv" : "Pausiert"}</span>
      ${next ? html`<span class="detail-head__next">${next}</span>` : ""}
    </div>
  </div>
  <div class="detail-head__actions">
    <a class="icon-btn" href="${base}/edit" title="Bearbeiten" aria-label="Bearbeiten">${ICON.pencil}</a>
    <button type="button" class="icon-btn" title="Archivieren" aria-label="Archivieren" hx-post="${base}/archive" hx-swap="none" hx-confirm="„${a.name}“ archivieren? Die Timer werden entfernt, die Logs bleiben.">${ICON.trash}</button>
    <button type="button" class="btn btn--primary" hx-post="${base}/run" hx-swap="none">${ICON.play}<span>Jetzt ausführen</span></button>
  </div>
</header>`;
}

function history(slug: string, runs: RunRecord[], mark: string | undefined, active: string | undefined, now: Date, oob = false) {
  const items = runs.map((r) => {
    const url = `/agents/${slug}/runs/${r.runId}`;
    const dot = isFailed(r)
      ? html`<i class="run-dot run-dot--error" title="${STATUS_LABEL[r.status] ?? r.status}"></i>`
      : r.status === "running"
        ? html`<i class="run-dot run-dot--running" title="Läuft"></i>`
        : isUnread(r, mark)
          ? html`<i class="run-dot run-dot--unread" title="Ungelesen"></i>`
          : "";
    const extra = [r.trigger === "manual" ? " · Manuell" : "", r.status === "running" ? " · Läuft" : ""].join("");
    return html`<li><a class="run-item${r.runId === active ? " is-active" : ""}" href="${url}" hx-get="${url}" hx-target="#detail-panel" hx-swap="outerHTML" hx-push-url="true">
  <span class="run-item__label">${cap(atLabel(r.start, now))}${extra}</span>${dot}
</a></li>`;
  });
  return html`<ul class="history__list" id="verlauf"${oob ? html` hx-swap-oob="true"` : ""}>${items.length ? items : html`<li class="history__empty">Noch keine Läufe</li>`}</ul>`;
}

function field(label: string, icon: unknown, body: unknown, sub?: string) {
  return html`<div class="field">
  <h3 class="field__label">${label}</h3>
  <div class="field__value">${icon ? html`<span class="field__icon">${icon}</span>` : ""}<span>${body}${sub ? html`<span class="field__sub">${sub}</span>` : ""}</span></div>
</div>`;
}

function infoPanel(c: AgentCard) {
  const a = c.agent;
  let repeat: string;
  try {
    repeat = cronToOnCalendar(a.cron).human;
  } catch {
    repeat = a.cron;
  }
  const long = a.prompt.length > LONG_PROMPT || a.prompt.split("\n").length > 14;
  const prompt = a.prompt
    ? html`${long ? html`<input type="checkbox" id="prompt-more" class="prompt__toggle" hidden>` : ""}<div class="prompt prose${long ? " prompt--long" : ""}">${raw(renderMarkdown(a.prompt))}</div>${long ? html`<label for="prompt-more" class="prompt__more"><span class="more">Mehr anzeigen</span><span class="less">Weniger anzeigen</span></label>` : ""}`
    : html`<p class="field__none">Kein Prompt hinterlegt.</p>`;
  return html`<section class="panel" id="detail-panel">
  <div class="field field--prompt">
    <h3 class="field__label">Anweisungen</h3>
    ${prompt}
  </div>
  <div class="fields">
    ${field("Projekt", ICON.folder, html`<span title="${a.cwd}">${c.project}</span>`)}
    ${field("Wiederholung", ICON.repeat, repeat)}
    ${field("Berechtigungen", ICON.shield, "Automatisch genehmigen", "Claude läuft eigenständig im Auto Mode")}
    ${field("Grenzen", ICON.gauge, `${num(a.timeout)} min · ${num(a.maxTurns)} Turns · ${num(a.maxBudgetUsd)} USD`)}
  </div>
</section>`;
}

function runPanel(c: AgentCard, r: RunRecord, stateDir: string, now: Date) {
  const slug = c.agent.slug;
  const url = `/agents/${slug}/runs/${r.runId}`;
  const running = r.status === "running";
  const { result, tools } = readRunDetail(stateDir, slug, r.runId);
  const dur = r.durationMs ?? (running ? now.getTime() - Date.parse(r.start) : undefined);
  const metric = (k: string, v: unknown) => html`<div class="metric"><dt>${k}</dt><dd>${v}</dd></div>`;
  const poll = running ? html` hx-get="${url}" hx-trigger="every 3s" hx-swap="outerHTML"` : "";
  return html`<section class="panel panel--run" id="detail-panel"${poll}>
  <a class="panel__back" href="/agents/${slug}" hx-get="/agents/${slug}" hx-target="#detail-panel" hx-swap="outerHTML" hx-push-url="true">‹ Anweisungen</a>
  <h2 class="run-title">${cap(atLabel(r.start, now))}</h2>
  <dl class="metrics">
    ${metric("Status", html`<span class="state state--${r.status}">${STATUS_LABEL[r.status] ?? r.status}</span>`)}
    ${metric("Dauer", dur != null && Number.isFinite(dur) ? formatDuration(dur) : "—")}
    ${metric("Turns", r.turns ?? "—")}
    ${metric("Kosten", r.costUsd != null ? usd(r.costUsd) : "—")}
    ${metric("Auslöser", r.trigger === "manual" ? "Manuell" : "Zeitplan")}
    ${metric("Start", stamp(r.start))}
  </dl>
  ${r.error ? html`<p class="notice">${r.error}</p>` : ""}
  <div class="field">
    <h3 class="field__label">Ergebnis</h3>
    ${result ? html`<div class="prose">${raw(renderMarkdown(result))}</div>` : html`<p class="field__none">${running ? "Der Lauf ist noch nicht fertig." : "Kein Ergebnis."}</p>`}
  </div>
  ${tools.length
    ? html`<details class="tools"${running ? " open" : ""}>
    <summary>Werkzeugaufrufe (${tools.length})</summary>
    <ol class="tools__list">${tools.map((t) => html`<li class="tool"><span class="tool__name">${t.name}</span><code class="tool__input">${t.input}</code></li>`)}</ol>
  </details>`
    : html`<p class="tools tools--empty">Keine Werkzeugaufrufe</p>`}
</section>`;
}

async function notFound(c: Context, ctx: Ctx, text: string) {
  if (c.req.header("HX-Request")) return c.text(text, 404);
  const { cards } = await loadOverview(ctx);
  const main = html`<header class="page-head"><div><h1 class="page-title">Nicht gefunden</h1><p class="page-sub">${text}</p></div></header>`;
  return c.html(layout("Nicht gefunden", sidebar(sortCards(cards, "name"), "", ctx.now()), main), 404);
}

async function show(c: Context, ctx: Ctx, slug: string, runId?: string) {
  if (!SLUG.test(slug)) return notFound(c, ctx, "Ungültiger Agent.");
  if (runId !== undefined && !RUN_ID.test(runId)) return notFound(c, ctx, "Ungültiger Lauf.");
  const runs = listRuns(slug, ctx.stateDir);
  const run = runId !== undefined ? runs.find((r) => r.runId === runId) : undefined;
  if (runId !== undefined && !run) return notFound(c, ctx, `Es gibt keinen Lauf „${runId}“.`);

  const { cards } = await loadOverview(ctx);
  const card = cards.find((x) => x.agent.slug === slug);
  if (!card) return notFound(c, ctx, `Es gibt keinen Agenten „${slug}“.`);

  // Öffnen eines beendeten Laufs markiert ihn gelesen; Punkt in der Sidebar danach neu berechnen.
  if (run && run.status !== "running") markSeen(ctx.stateDir, slug, run.start);
  const mark = readSeen(ctx.stateDir)[slug];
  const navCards = cards.map((x) => (x.agent.slug === slug ? { ...x, unread: runs.some((r) => isUnread(r, mark)) } : x));
  const now = ctx.now();
  const panel = run ? runPanel(card, run, ctx.stateDir, now) : infoPanel(card);
  const nav = sortCards(navCards, "name");

  c.header("Vary", "HX-Request");
  if (c.req.header("HX-Request") && !c.req.header("HX-History-Restore-Request")) {
    return c.html(html`${panel}${history(slug, runs, mark, run?.runId, now, true)}${sidebar(nav, slug, now, { oob: true })}`);
  }
  const main = html`${head(card, now)}
<div class="detail">
  <section class="history">
    <h2 class="section-title">Verlauf</h2>
    ${history(slug, runs, mark, run?.runId, now)}
  </section>
  ${panel}
</div>`;
  return c.html(layout(run ? `${card.agent.name} · Lauf` : card.agent.name, sidebar(nav, slug, now), main));
}

export function register(app: Hono, ctx: Ctx) {
  app.get("/agents/:slug", async (c, next: Next) => {
    const slug = c.req.param("slug");
    if (slug === "new") {
      await next();
      return;
    }
    return show(c, ctx, slug);
  });
  app.get("/agents/:slug/runs/:runId", (c) => show(c, ctx, c.req.param("slug"), c.req.param("runId")));
}
