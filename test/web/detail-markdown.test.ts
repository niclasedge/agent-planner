import { test, expect } from "bun:test";
import { renderMarkdown } from "../../src/web/markdown";

test("Markdown: Überschrift, Fett, Liste, Code", () => {
  const h = renderMarkdown("# Titel\n\n**fett** und `code`\n\n- eins\n- zwei");
  expect(h).toContain("<h1>Titel</h1>");
  expect(h).toContain("<strong>fett</strong>");
  expect(h).toContain("<code>code</code>");
  expect(h).toContain("<li>eins</li>");
});

test("Markdown: rohes HTML wird escaped (Block und inline)", () => {
  const h = renderMarkdown("<script>alert(1)</script>\n\nText <img src=x onerror=alert(1)> und <b>b</b>");
  expect(h).not.toContain("<script");
  expect(h).not.toContain("<img");
  expect(h).not.toContain("<b>");
  expect(h).toContain("&lt;script&gt;");
  expect(h).toContain("&lt;img");
});

test("Markdown: javascript:-Links und Bilder entschärft", () => {
  const h = renderMarkdown('[x](javascript:alert(1)) [y](JaVaScRiPt:alert(2)) [ok](https://example.org "t") ![bild](https://example.org/a.png)');
  expect(h.toLowerCase()).not.toContain("javascript:");
  expect(h).toContain('href="https://example.org"');
  expect(h).toContain('rel="noopener noreferrer"');
  expect(h).not.toContain("<img");
  expect(h).toContain('href="https://example.org/a.png"');
});

test("Markdown: Attribut-Ausbruch im Link-Titel escaped", () => {
  const h = renderMarkdown('[x](https://example.org "a\\" onmouseover=\\"alert(1)")');
  expect(h).not.toMatch(/"\s*onmouseover=/);
});

test("Markdown: leerer Text", () => {
  expect(renderMarkdown("")).toBe("");
});
