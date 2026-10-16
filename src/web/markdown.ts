import { Marked, type Tokens } from "marked";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Erlaubt nur http(s), mailto, Anker und relative Ziele; alles andere (javascript:, data: …) fällt weg. */
function safeHref(href: string): string | null {
  const h = href.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(h.replace(/[\u0000-\u001f\s]+/g, ""));
  if (!scheme) return h;
  return ["http", "https", "mailto"].includes(scheme[1].toLowerCase()) ? h : null;
}

const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // Rohes HTML aus Prompts und Agent-Ausgaben wird als Text gezeigt, nie ausgeführt.
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return esc(text);
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const safe = safeHref(href);
      if (safe === null) return inner;
      const t = title ? ` title="${esc(title)}"` : "";
      return `<a href="${esc(safe)}"${t} rel="noopener noreferrer" target="_blank">${inner}</a>`;
    },
    // Keine Bilder von außen laden: als Link zeigen.
    image({ href, text }: Tokens.Image) {
      const safe = safeHref(href);
      const label = esc(text || href);
      return safe === null ? label : `<a href="${esc(safe)}" rel="noopener noreferrer" target="_blank">${label}</a>`;
    },
  },
});

/** Markdown -> HTML ohne rohes HTML und ohne gefährliche Links. */
export function renderMarkdown(src: string): string {
  if (!src.trim()) return "";
  return md.parse(src, { async: false }) as string;
}
