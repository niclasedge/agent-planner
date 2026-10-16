import { readdirSync } from "node:fs";
import { join } from "node:path";
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export const publicDir = join(import.meta.dir, "../../public");

/** `/css/base.css` zuerst, danach alle weiteren `public/css/*.css` alphabetisch. */
export function cssFiles(dir: string = publicDir): string[] {
  let files: string[] = [];
  try {
    files = readdirSync(join(dir, "css")).filter((f) => f.endsWith(".css") && f !== "base.css").sort();
  } catch {
    // kein css-Ordner
  }
  return ["base.css", ...files].map((f) => `/css/${f}`);
}

/** Fertiges HTML aus `html`…``; reine Strings werden escaped (#12). */
type Part = HtmlEscapedString | Promise<HtmlEscapedString>;

/** Fehler von htmx-Anfragen (403, 500, Netz) sichtbar machen; htmx selbst zeigt sie nicht an. */
const ERROR_TOAST = `<script>
(function () {
  function toast(text) {
    var box = document.getElementById("toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "toasts";
      box.className = "toasts";
      box.setAttribute("aria-live", "assertive");
      document.body.appendChild(box);
    }
    var t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "alert");
    t.textContent = text;
    box.appendChild(t);
    setTimeout(function () { t.classList.add("toast--out"); setTimeout(function () { t.remove(); }, 300); }, 7000);
  }
  document.addEventListener("htmx:responseError", function (e) {
    var x = e.detail.xhr;
    toast("Fehler " + x.status + ": " + String(x.responseText || x.statusText || "").slice(0, 300));
  });
  document.addEventListener("htmx:sendError", function () { toast("Server nicht erreichbar"); });
})();
</script>`;

/** Seitenrahmen. `sidebar` und `main` sind Ergebnisse von `html`…``; alles andere wird escaped. */
export function layout(title: string, sidebar: Part, main: Part, opts: { css?: string[] } = {}) {
  const css = (opts.css ?? cssFiles()).map((h) => html`<link rel="stylesheet" href="${h}">`);
  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${title} · agent-planner</title>
${css}
<script src="/vendor/htmx.min.js" defer></script>
${raw(ERROR_TOAST)}
</head>
<body>
<div class="app">
<aside class="sidebar">${sidebar}</aside>
<main class="main">${main}</main>
</div>
</body>
</html>`;
}
