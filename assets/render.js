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
  /* dot-point chips: click one to show what that dot point says (works on any page that shows questions) */
  const sylCache = {};
  function syllabus(course) {
    if (!sylCache[course]) sylCache[course] = fetch("data/syllabus/" + course + ".json").then((r) => r.json()).then((syl) => {
      const m = {};
      for (const y of syl.years) for (const t of y.topics) for (const s of t.subtopics) for (const p of s.dotpoints)
        m[p.id] = { text: p.text, topic: t.name, sub: s.name, year: y.year };
      return m;
    }).catch(() => ({}));
    return sylCache[course];
  }
  function dpChips(course, ids) {
    return `<span class="dps">${(ids || []).map((d) => `<button type="button" class="dp-chip" data-dpinfo="${esc(d)}" data-course="${esc(course)}" aria-expanded="false" title="What is dot point ${esc(d)}?">${esc(d)}</button>`).join("")}</span>`;
  }
  document.addEventListener("click", async (e) => {
    const chip = e.target.closest(".dp-chip");
    if (!chip) return;
    // each chip toggles its own box, so several dot points can be open at once (listed in chip order)
    const card = chip.closest(".q") || chip.parentElement;
    let wrap = card.querySelector(":scope > .dp-reveals");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "dp-reveals"; chip.closest(".src").after(wrap); }
    const id = chip.dataset.dpinfo;
    const existing = [...wrap.children].find((b) => b.dataset.id === id);
    if (existing) { existing.remove(); chip.classList.remove("on"); chip.setAttribute("aria-expanded", "false"); return; }
    chip.classList.add("on"); chip.setAttribute("aria-expanded", "true");
    const box = document.createElement("div"); box.className = "dp-reveal"; box.dataset.id = id;
    const order = [...card.querySelectorAll(".dp-chip")].map((c) => c.dataset.dpinfo);
    const after = [...wrap.children].find((b) => order.indexOf(b.dataset.id) > order.indexOf(id));
    wrap.insertBefore(box, after || null);
    const d = (await syllabus(chip.dataset.course))[id];
    box.innerHTML = d ? `<div class="dp-where">Year ${esc(d.year)} · ${esc(d.topic)}${d.sub && d.sub !== d.topic ? " › " + esc(d.sub) : ""}</div><div><b class="dpid">${esc(id)}</b> ${md(d.text, true)}</div>`
      : `<div><b class="dpid">${esc(id)}</b> (not in the current syllabus)</div>`;
  });
  window.HSCRender = { esc, tex, md, dpChips };
})();

/* Login state shared by every page. assets/auth.js (a module, loaded after this) fills it in;
   `ready` resolves once Firebase has reported the first sign-in state (or straight away if logins are off). */
(function () {
  let done;
  window.HSCAuth = window.HSCAuth || { enabled: false, user: null, isAdmin: false, ready: new Promise((r) => (done = r)) };
  window.HSCAuth._resolve = done;
  // safety net: never let a slow or blocked Firebase hold the page up
  setTimeout(() => done && done(), 6000);
})();
