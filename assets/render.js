/* Better HSC Papers — shared Markdown + LaTeX renderer (used by the course pages and the submit page). */
(function () {
  "use strict";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function tex(src, display) {
    src = src.replace(/\u0003/g, "\\$");
    try { return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore" }); }
    catch (e) { return "<code>" + esc(src) + "</code>"; }
  }
  // Markdown is sanitised (DOMPurify) BEFORE the maths is put back, so user text can't inject HTML/script,
  // while KaTeX's own markup is left untouched.
  function clean(html) {
    if (!window.DOMPurify) return html;
    return DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"], FORBID_ATTR: ["style"] });
  }
  function md(text, inline) {
    if (!text) return "";
    const maths = [];
    const t = String(text).replace(/\\\$/g, "\u0003").replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)/g,
      (m, a, b, c, d) => { maths.push([a ?? b ?? c ?? d, a != null || b != null]); return "\u0001" + (maths.length - 1) + "\u0002"; });
    const html = clean(inline ? marked.parseInline(t) : marked.parse(t));
    return html.replace(/\u0001(\d+)\u0002/g, (m, i) => (maths[+i] ? tex(maths[+i][0], maths[+i][1]) : "")).replace(/\u0003/g, "$");
  }
  window.HSCRender = { esc, tex, md };
})();
