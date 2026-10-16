import { html } from "hono/html";
import type { Hono } from "hono";
import type { EditCtx } from "../../actions";
import { cronToOnCalendar } from "../../cron";
import { listTemplates, templatesDir, type Template } from "../../templates";
import type { Ctx } from "../ctx";
import { loadOverview, promptSnippet, sortCards, STATUS_LABEL, type AgentCard, type Sort } from "../data";
import { formatDuration, formatRelative } from "../format";
import { layout } from "../layout";
import { sidebar, statusDot } from "../sidebar";

/** Vorlagenordner wie in `/agents/new` (#5): ctx.templatesDir, sonst AGENT_PLANNER_TEMPLATES, sonst <repo>/templates. */
const tplDir = (ctx: Ctx) => (ctx as EditCtx).templatesDir ?? templatesDir();

function humanCron(cron: string): string {
  try {
    return cronToOnCalendar(cron).human;
  } catch {
    return cron;
  }
}

const CLOCK = html`<svg class="tpl__clock" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

/** Abschnitt unter den Karten: Wellenlinie, je Vorlage Icon, Titel, Einzeiler, Zeitplan. */
export function templateSection(list: Template[]) {
  if (!list.length) return html``;
  return html`<section class="templates">
  <div class="wave" role="separator"></div>
  <h2 class="templates__title">Mit einer Vorlage beginnen</h2>
  <div class="templates__grid">${list.map(
    (t) => html`<a class="tpl" href="/agents/new?template=${t.slug}">
    <span class="tpl__icon" aria-hidden="true">${t.icon ?? "•"}</span>
    <span class="tpl__text">
      <span class="tpl__name">${t.name}</span>
      ${t.summary ? html`<span class="tpl__summary">${t.summary}</span>` : ""}
      <span class="tpl__when">${CLOCK}${humanCron(t.cron)}</span>
    </span>
  </a>`,
  )}</div>
</section>`;
}

function card(c: AgentCard, now: Date) {
  const l = c.last;
  const last = l
    ? html`<span class="meta__row"><span class="meta__label">Letzter Lauf</span> ${formatRelative(l.start, now)}${l.durationMs != null ? html` · ${formatDuration(l.durationMs)}` : ""}</span>
       <span class="meta__row"><span class="meta__label">Status</span> <span class="state state--${l.status}">${STATUS_LABEL[l.status] ?? l.status}</span></span>`
    : html`<span class="meta__row meta__row--none">Noch nie ausgeführt</span>`;
  const next = html`<span class="meta__row"><span class="meta__label">Nächster Lauf</span> ${c.next ? formatRelative(c.next, now) : "—"}</span>`;
  return html`<a class="card" href="/agents/${c.agent.slug}">
  <span class="card__head">${statusDot(c)}<span class="card__name">${c.agent.name}</span></span>
  <span class="card__prompt">${promptSnippet(c.agent.prompt)}</span>
  <span class="card__meta">${next}${last}</span>
  <span class="card__foot">
    <span class="pill ${c.paused ? "pill--paused" : "pill--active"}">${c.recurrence}</span>
    <span class="card__project">${c.project}</span>
  </span>
</a>`;
}

export function cards(list: AgentCard[], sort: Sort, now: Date) {
  const sorted = sortCards(list, sort);
  return html`<div id="cards" class="cards">${sorted.length
    ? sorted.map((c) => card(c, now))
    : html`<p class="empty">Noch keine Agenten. Lege eine Datei <code>&lt;name&gt;.md</code> im Agentenordner an.</p>`}</div>`;
}

export function register(app: Hono, ctx: Ctx) {
  app.get("/", async (c) => {
    const sort: Sort = c.req.query("sort") === "name" ? "name" : "next";
    const { cards: list, errors } = await loadOverview(ctx);
    const now = ctx.now();
    c.header("Vary", "HX-Request");
    if (c.req.header("HX-Request")) return c.html(cards(list, sort, now));
    const main = html`<header class="page-head">
  <div>
    <h1 class="page-title">Geplante Aufgaben</h1>
    <p class="page-sub">Agenten, die nach Zeitplan laufen.</p>
  </div>
  <label class="sort">
    <span>Sortieren</span>
    <select name="sort" hx-get="/" hx-trigger="change" hx-target="#cards" hx-swap="outerHTML" hx-push-url="true">
      <option value="next"${sort === "next" ? " selected" : ""}>Nächste Ausführung</option>
      <option value="name"${sort === "name" ? " selected" : ""}>Name</option>
    </select>
  </label>
</header>
${errors.map((e) => html`<p class="notice">${e}</p>`)}
${cards(list, sort, now)}
${templateSection(listTemplates(tplDir(ctx)))}`;
    return c.html(layout("Übersicht", sidebar(sortCards(list, "name"), "overview", now), main));
  });
}
