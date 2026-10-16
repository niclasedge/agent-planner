import { html } from "hono/html";
import type { AgentCard } from "./data";
import { formatRelative } from "./format";

/** Status-Kreis: grau = pausiert, blau = aktiv; roter Punkt bei Fehler im letzten Lauf. */
export function statusDot(c: AgentCard) {
  const tone = c.paused ? "status-dot--paused" : "status-dot--active";
  return html`<span class="status-dot ${tone}">${c.failed ? html`<i class="status-dot__badge status-dot--error"></i>` : ""}</span>`;
}

/** Punkt rechts im Eintrag: rot bei Fehler im letzten Lauf, sonst blau bei ungelesenem Lauf. */
export function navDot(c: AgentCard) {
  if (c.failed) return html`<i class="nav-dot nav-dot--error" title="Letzter Lauf fehlgeschlagen"></i>`;
  if (c.unread) return html`<i class="nav-dot nav-dot--unread" title="Ungelesener Lauf"></i>`;
  return "";
}

/** `active`: "overview" oder der Slug des gewählten Agenten. `oob`: für htmx-Antworten (hx-swap-oob). */
export function sidebar(cards: AgentCard[], active: string, now: Date, opts: { oob?: boolean } = {}) {
  const items = cards.map((c) => {
    const next = c.next ? formatRelative(c.next, now) : "—";
    return html`<a class="nav-item${active === c.agent.slug ? " is-active" : ""}" href="/agents/${c.agent.slug}">
  ${statusDot({ ...c, failed: false })}
  <span class="nav-item__text"><span class="nav-item__name">${c.agent.name}</span><span class="nav-item__sub">${next}</span></span>
  ${navDot(c)}
</a>`;
  });
  return html`<nav class="nav" id="nav"${opts.oob ? html` hx-swap-oob="true"` : ""}>
  <a class="nav-item nav-item--top${active === "overview" ? " is-active" : ""}" href="/"><span class="nav-icon">▦</span><span class="nav-item__name">Übersicht</span></a>
  <div class="nav-list">${items}</div>
  <a class="nav-new" href="/agents/new">+ Neuer Agent</a>
</nav>`;
}
