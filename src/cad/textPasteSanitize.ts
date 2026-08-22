/**
 * textPasteSanitize.ts — Normalisierung von extern eingefügtem Text.
 *
 * Wird beim Einfügen (Strg+V) in eine geöffnete Textbox verwendet — sowohl in
 * der CAD-Oberfläche als auch in der Projektmappe (gemeinsamer
 * `TextEditorOverlay`).
 *
 * Regeln (bewusst streng):
 *  - Schriftgröße, Schriftart, Farbe, Hintergrund, Ausrichtung, Zeilenhöhe und
 *    sämtliches Office-/Website-spezifische CSS werden **verworfen**. Die
 *    Textbox bzw. der Typing-Style an der Caretposition bleibt führend.
 *  - Zeichenauszeichnungen fett / kursiv / unterstrichen / durchgestrichen
 *    bleiben erhalten.
 *  - Absätze, Zeilenumbrüche, Listen und Tabellenzeilen werden zu einfachen
 *    Zeilenumbrüchen normalisiert.
 */

interface Marks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

const BLOCK_TAGS = new Set([
  "DIV", "P", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6",
  "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "PRE",
]);

const DROP_TAGS = new Set([
  "STYLE", "SCRIPT", "META", "LINK", "TITLE", "HEAD", "NOSCRIPT", "IFRAME", "OBJECT",
]);

function marksFromElement(el: HTMLElement, cur: Marks): Marks {
  const tag = el.tagName;
  const next: Marks = { ...cur };
  if (tag === "B" || tag === "STRONG") next.bold = true;
  if (tag === "I" || tag === "EM") next.italic = true;
  if (tag === "U" || tag === "INS") next.underline = true;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.strike = true;

  const style = el.getAttribute("style") || "";
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim().toLowerCase();
    if (key === "font-weight") {
      const num = parseInt(value, 10);
      if (value === "bold" || value === "bolder" || (Number.isFinite(num) && num >= 600)) next.bold = true;
      if (value === "normal" || (Number.isFinite(num) && num < 600)) next.bold = false;
    } else if (key === "font-style") {
      if (value === "italic" || value === "oblique") next.italic = true;
      if (value === "normal") next.italic = false;
    } else if (key === "text-decoration" || key === "text-decoration-line") {
      if (value.includes("underline")) next.underline = true;
      if (value.includes("line-through")) next.strike = true;
      if (value.includes("none")) { next.underline = false; next.strike = false; }
    }
  }
  return next;
}

/** Wandelt Text in HTML-sicheren Inhalt mit `<br>` für Zeilenumbrüche. */
function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapMarks(inner: string, m: Marks): string {
  if (!inner) return "";
  let out = inner;
  if (m.strike) out = `<s>${out}</s>`;
  if (m.underline) out = `<u>${out}</u>`;
  if (m.italic) out = `<i>${out}</i>`;
  if (m.bold) out = `<b>${out}</b>`;
  return out;
}

function walk(node: Node, marks: Marks, out: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    // Word/HTML liefert viele weiche Umbrüche und geschützte Leerzeichen.
    const raw = (node.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]*\n[ \t]*/g, " ")
      .replace(/[ \t]{2,}/g, " ");
    if (!raw) return;
    out.push(wrapMarks(escapeText(raw), marks));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (DROP_TAGS.has(tag)) return;
  if (tag === "BR") { out.push("<br>"); return; }

  const isBlock = BLOCK_TAGS.has(tag) || tag === "TABLE" || tag === "UL" || tag === "OL";
  const before = out.length;
  const next = marksFromElement(el, marks);
  for (const child of Array.from(el.childNodes)) walk(child, next, out);
  if (isBlock && out.length > before) {
    const last = out[out.length - 1];
    if (last !== "<br>") out.push("<br>");
  }
}

/** Bereinigt externes HTML für das Einfügen in eine PixunaCAD-Textbox. */
export function sanitizePastedHtml(html: string): string {
  const root = document.createElement("div");
  // Word-Conditional-Comments vorab entfernen.
  root.innerHTML = (html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?o:[^>]*>/gi, "")
    .replace(/\u200B/g, "");
  root.querySelectorAll("style, script, meta, link, title").forEach((n) => n.remove());

  const out: string[] = [];
  walk(root, { bold: false, italic: false, underline: false, strike: false }, out);
  let result = out.join("");
  // Führende/abschließende Umbrüche aus Block-Wrappern entfernen.
  result = result.replace(/^(?:<br>)+/, "").replace(/(?:<br>)+$/, "");
  return result;
}

/** Reiner Text → HTML-Fragment (Fallback, wenn kein text/html vorliegt). */
export function plainTextToHtml(text: string): string {
  return escapeText((text || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n"))
    .split("\n")
    .join("<br>");
}
