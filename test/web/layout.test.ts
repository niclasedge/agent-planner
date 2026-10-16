import { test, expect } from "bun:test";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { layout } from "../../src/web/layout";

const css = { css: ["/css/base.css"] };

test("#12: reiner String in layout() wird escaped", async () => {
  const plain = "<script>alert(1)</script>" as unknown as HtmlEscapedString; // simuliert einen Aufrufer ohne Typprüfung
  const h = String(await layout("T", html`<nav>S</nav>`, plain, css));
  expect(h).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(h).not.toContain("<script>alert(1)");
  const h2 = String(await layout("T", plain, html`<p>M</p>`, css));
  expect(h2).toContain('<aside class="sidebar">&lt;script&gt;');
});

test("#12: html-Teile bleiben HTML, ohne doppelte Escapes", async () => {
  const h = String(await layout("T", html`<nav>S</nav>`, html`<p>${"<b>"}</p>`, css));
  expect(h).toContain('<aside class="sidebar"><nav>S</nav></aside>');
  expect(h).toContain('<main class="main"><p>&lt;b&gt;</p></main>');
  expect(h).not.toContain("&amp;lt;");
});

test("#12: asynchroner Teil wird eingesetzt", async () => {
  const later = Promise.resolve(html`<p>später</p>`) as Promise<HtmlEscapedString>;
  const h = String(await layout("T", html`<nav></nav>`, later, css));
  expect(h).toContain('<main class="main"><p>später</p></main>');
  expect(h).not.toContain("[object Promise]");
});
