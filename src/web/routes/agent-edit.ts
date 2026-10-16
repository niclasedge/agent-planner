import { html } from "hono/html";
import type { Context, Hono } from "hono";
import { existsSync } from "node:fs";
import { DEFAULTS, loadAgent, type Agent } from "../../agent";
import { cronWarning } from "../../cron";
import {
  agentPath, archiveAgent, checkCron, isSafeSlug, runNow, syncOne, toggleAgent, unitDeps, validateForm, writeAgentFile,
  type EditCtx, type FieldErrors, type FormInput,
} from "../../actions";
import { listTemplates, loadTemplate, templatesDir, type Template } from "../../templates";
import type { Ctx } from "../ctx";
import { loadOverview, sortCards } from "../data";
import { layout } from "../layout";
import { sidebar } from "../sidebar";

const FIELDS: (keyof FormInput)[] = ["name", "cron", "cwd", "model", "prompt", "timeout", "maxTurns", "maxBudgetUsd"];

function fromAgent(a: Pick<Agent, "name" | "cron" | "cwd" | "prompt"> & Partial<Agent>): FormInput {
  return {
    name: a.name, cron: a.cron, cwd: a.cwd, model: a.model ?? "", prompt: a.prompt,
    timeout: String(a.timeout ?? DEFAULTS.timeout),
    maxTurns: String(a.maxTurns ?? DEFAULTS.maxTurns),
    maxBudgetUsd: String(a.maxBudgetUsd ?? DEFAULTS.maxBudgetUsd),
  };
}

const empty = (cwd: string): FormInput => fromAgent({ name: "", cron: "", cwd, prompt: "" });

type Hint = { human?: string; error?: string; warning?: string };

/** checkCron plus Warnung (#13): gültig, aber ohne nächsten Termin — Hinweis, kein Fehler. */
async function checkHint(expr: string): Promise<Hint> {
  const r = await checkCron(expr);
  return r.error ? r : { ...r, warning: await cronWarning(expr) };
}

function cronHint(r: Hint) {
  if (r.error) return html`<span class="af-hint af-hint--error">${r.error}</span>`;
  if (r.warning) return html`<span class="af-hint af-hint--warn">${r.warning}. Speichern geht trotzdem, etwa für einen bewusst pausierten Plan.</span>`;
  return html`<span class="af-hint af-hint--ok">${r.human}</span>`;
}

interface FormView {
  action: string;
  values: FormInput;
  errors: FieldErrors;
  hint: Hint | null;
  submit: string;
}

function field(name: keyof FormInput, label: string, errors: FieldErrors, control: unknown, help?: unknown) {
  const err = errors[name];
  return html`<div class="af-field${err ? " af-field--error" : ""}">
  <label class="af-field__label" for="f-${name}">${label}</label>
  ${control}
  ${help ?? ""}
  ${err ? html`<p class="af-field__error" id="e-${name}">${err}</p>` : ""}
</div>`;
}

const inv = (e: FieldErrors, n: keyof FormInput) => (e[n] ? html` aria-invalid="true" aria-describedby="e-${n}"` : "");

export function agentForm(v: FormView) {
  const { values: x, errors: e } = v;
  const limitsOpen = e.timeout || e.maxTurns || e.maxBudgetUsd;
  return html`<form id="agent-form" class="af-form" hx-post="${v.action}" hx-target="this" hx-swap="outerHTML">
${e.form ? html`<p class="notice">${e.form}</p>` : ""}
${field("name", "Name", e, html`<input class="af-input af-input--title" id="f-name" name="name" value="${x.name}" placeholder="z. B. Tägliches Briefing" autocomplete="off"${inv(e, "name")}>`)}
${field("cron", "Wiederholung (Cron)", { ...e, cron: undefined },
  html`<input class="af-input af-input--mono" id="f-cron" name="cron" value="${x.cron}" placeholder="0 7 * * *" autocomplete="off" hx-get="/cron/check" hx-trigger="keyup changed delay:300ms" hx-target="#cron-hint" hx-swap="innerHTML"${e.cron ? html` aria-invalid="true" aria-describedby="cron-hint"` : ""}>`,
  html`<p class="af-field__help" id="cron-hint" aria-live="polite">${e.cron ? cronHint({ error: e.cron }) : v.hint ? cronHint(v.hint) : html`<span class="af-hint">Minute Stunde Tag Monat Wochentag</span>`}</p>`)}
<div class="af-form__row">
${field("cwd", "Projekt (Arbeitsordner)", e, html`<input class="af-input af-input--mono" id="f-cwd" name="cwd" value="${x.cwd}" autocomplete="off"${inv(e, "cwd")}>`)}
${field("model", "Modell (optional)", e, html`<input class="af-input af-input--mono" id="f-model" name="model" value="${x.model}" placeholder="Vorgabe des SDK" autocomplete="off"${inv(e, "model")}>`)}
</div>
${field("prompt", "Prompt", e, html`<textarea class="af-input af-textarea" id="f-prompt" name="prompt" rows="12" placeholder="Was soll der Agent tun?"${inv(e, "prompt")}>${x.prompt}</textarea>`)}
<details class="af-limits"${limitsOpen ? " open" : ""}>
<summary>Grenzen <span class="af-limits__sum">${x.timeout || DEFAULTS.timeout} min · ${x.maxTurns || DEFAULTS.maxTurns} Turns · ${x.maxBudgetUsd || DEFAULTS.maxBudgetUsd} USD</span></summary>
<div class="af-form__row af-form__row--3">
${field("timeout", "Zeitlimit (min)", e, html`<input class="af-input" id="f-timeout" name="timeout" inputmode="decimal" value="${x.timeout}"${inv(e, "timeout")}>`)}
${field("maxTurns", "Max. Turns", e, html`<input class="af-input" id="f-maxTurns" name="maxTurns" inputmode="numeric" value="${x.maxTurns}"${inv(e, "maxTurns")}>`)}
${field("maxBudgetUsd", "Budget (USD)", e, html`<input class="af-input" id="f-maxBudgetUsd" name="maxBudgetUsd" inputmode="decimal" value="${x.maxBudgetUsd}"${inv(e, "maxBudgetUsd")}>`)}
</div>
</details>
<div class="af-form__actions"><button class="af-btn af-btn--primary" type="submit">${v.submit}</button></div>
</form>`;
}

function templatePicker(list: Template[], active?: string) {
  if (!list.length) return "";
  return html`<nav class="af-tpl-pick" aria-label="Vorlagen"><span class="af-tpl-pick__label">Vorlage</span>${list.map(
    (t) => html`<a class="af-tpl-pick__item${t.slug === active ? " is-active" : ""}" href="/agents/new?template=${t.slug}">${t.icon ? html`<span class="af-tpl-pick__icon">${t.icon}</span>` : ""}${t.name}</a>`,
  )}</nav>`;
}

export function register(app: Hono, ctx: Ctx) {
  const ectx = ctx as EditCtx;
  const deps = () => unitDeps(ectx);
  const tplDir = () => ectx.templatesDir ?? templatesDir();
  const defaultCwd = () => ectx.defaultCwd ?? process.env.AGENT_PLANNER_DEFAULT_CWD ?? "";

  async function page(c: Context, title: string, sub: string, active: string, body: unknown) {
    const { cards } = await loadOverview(ctx);
    const main = html`<header class="page-head"><div><h1 class="page-title">${title}</h1><p class="page-sub">${sub}</p></div></header>${body}`;
    return c.html(layout(title, sidebar(sortCards(cards, "name"), active, ctx.now()), main));
  }

  /** htmx: HX-Redirect/HX-Refresh; ohne htmx: 303. */
  function done(c: Context, url: string, refresh = false) {
    if (c.req.header("hx-request") === "true") {
      c.header(refresh ? "HX-Refresh" : "HX-Redirect", refresh ? "true" : url);
      return c.body(null, 200);
    }
    return c.redirect(url, 303);
  }

  const known = (slug: string) => isSafeSlug(slug) && existsSync(agentPath(ctx.agentDir, slug));

  async function readInput(c: Context): Promise<FormInput> {
    const b = await c.req.parseBody();
    return Object.fromEntries(FIELDS.map((k) => [k, typeof b[k] === "string" ? (b[k] as string) : ""])) as unknown as FormInput;
  }

  /** Erst schreiben, dann synchronisieren; beide Fehler getrennt melden. Weiterleitung nur, wenn beides klappt. */
  async function persist(c: Context, a: Agent, values: FormInput, create: boolean) {
    const target = `/agents/${a.slug}`;
    try {
      writeAgentFile(ctx.agentDir, a, { exclusive: create });
    } catch (e) {
      const msg = (e as Error).message;
      const errors: FieldErrors = create && /existiert schon/.test(msg)
        ? { name: `Kürzel „${a.slug}“ ist schon vergeben` }
        : { form: `Nicht gespeichert: ${msg}` };
      const action = create ? "/agents" : target;
      return c.html(agentForm({ action, values, errors, hint: null, submit: create ? "Anlegen" : "Speichern" }));
    }
    try {
      await syncOne(deps(), a);
    } catch (e) {
      // Datei liegt jetzt: weiter als Bearbeiten-Formular, damit ein zweites Absenden nicht am Kürzel scheitert
      const errors = { form: `Gespeichert, aber Zeitplan nicht aktualisiert: ${(e as Error).message}` };
      return c.html(agentForm({ action: target, values, errors, hint: null, submit: "Speichern" }));
    }
    // #13: gespeichert, aber feuert nie -> zurück ins Formular, dort steht die Warnung
    if (await cronWarning(a.cron)) return done(c, `${target}/edit?saved=1`);
    return done(c, target);
  }

  app.get("/cron/check", async (c) => {
    const expr = c.req.query("expr") ?? c.req.query("cron") ?? "";
    return c.html(cronHint(await checkHint(expr)));
  });

  app.get("/agents/new", async (c) => {
    const slug = c.req.query("template");
    const list = listTemplates(tplDir());
    let values = empty(defaultCwd());
    let notice = "";
    if (slug) {
      const t = loadTemplate(tplDir(), slug);
      if (t) values = fromAgent({ ...t, cwd: t.cwd || defaultCwd() }); // cwd der Vorlage gewinnt
      else notice = `Vorlage „${slug}“ nicht gefunden.`;
    }
    const hint = values.cron ? await checkHint(values.cron) : null;
    const body = html`${notice ? html`<p class="notice">${notice}</p>` : ""}${templatePicker(list, slug)}${agentForm({ action: "/agents", values, errors: {}, hint, submit: "Anlegen" })}`;
    return page(c, "Neuer Agent", "Läuft nach Zeitplan im gewählten Projekt.", "new", body);
  });

  app.post("/agents", async (c) => {
    const values = await readInput(c);
    const r = await validateForm(values, { agentDir: ctx.agentDir });
    if (!r.agent) return c.html(agentForm({ action: "/agents", values, errors: r.errors, hint: null, submit: "Anlegen" }));
    return persist(c, r.agent, values, true);
  });

  app.get("/agents/:slug/edit", async (c) => {
    const slug = c.req.param("slug");
    if (!known(slug)) return c.notFound();
    let a: Agent;
    try {
      a = loadAgent(ctx.agentDir, slug);
    } catch (e) {
      return c.text(`Agent-Datei fehlerhaft: ${(e as Error).message}`, 422);
    }
    const values = fromAgent(a);
    const hint = await checkHint(a.cron);
    const saved = c.req.query("saved") === "1" && hint.warning
      ? html`<p class="notice notice--warn" role="status">Gespeichert. ${hint.warning}. <a href="/agents/${slug}">Zum Agenten</a></p>`
      : "";
    const form = agentForm({ action: `/agents/${slug}`, values, errors: {}, hint, submit: "Speichern" });
    return page(c, `${a.name} bearbeiten`, `${slug}.md`, slug, html`${saved}${form}`);
  });

  app.post("/agents/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!known(slug)) return c.notFound();
    const values = await readInput(c);
    const action = `/agents/${slug}`;
    const r = await validateForm(values, { agentDir: ctx.agentDir, slug });
    if (!r.agent) return c.html(agentForm({ action, values, errors: r.errors, hint: null, submit: "Speichern" }));
    let enabled = false;
    try {
      enabled = loadAgent(ctx.agentDir, slug).enabled;
    } catch {
      // Datei unlesbar: sie wird mit den Formularwerten neu geschrieben, der Agent bleibt vorsichtshalber pausiert
    }
    return persist(c, { ...r.agent, enabled }, values, false);
  });

  const action = (fn: (slug: string) => Promise<unknown>, target: (slug: string) => string, refresh: boolean) =>
    async (c: Context) => {
      const slug = c.req.param("slug") ?? "";
      if (!known(slug)) return c.notFound();
      try {
        await fn(slug);
      } catch (e) {
        return c.text((e as Error).message, 500);
      }
      return done(c, target(slug), refresh);
    };

  app.post("/agents/:slug/toggle", action((s) => toggleAgent(deps(), s), (s) => `/agents/${s}`, true));
  app.post("/agents/:slug/run", action((s) => runNow(deps(), s), (s) => `/agents/${s}`, true));
  app.post("/agents/:slug/archive", action((s) => archiveAgent(deps(), s), () => "/", false));
}
