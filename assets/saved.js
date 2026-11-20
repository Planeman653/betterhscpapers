/* Better HSC Papers — "Saved questions": the signed-in user's own question bank, across all subjects. */
(function () {
  "use strict";
  const A = window.HSCAuth;
  const { esc, md, dpChips } = window.HSCRender;
  const $ = (id) => document.getElementById(id);
  const NAMES = { standard1: "Mathematics Standard 1", standard2: "Mathematics Standard 2", advanced: "Mathematics Advanced", extension1: "Mathematics Extension 1", extension2: "Mathematics Extension 2", physics: "Physics", chemistry: "Chemistry", biology: "Biology" };
  const SCI = { physics: 1, chemistry: 1, biology: 1 };
  const DIFF = ["", "Easy", "Moderate", "Medium", "Hard", "Very hard"];
  const toast = (m) => { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 2600); };
  const cache = {};
  let Q = [], filter = "", opened = new Set(), showAll = false, tok = 0;

  // one subject's questions (static bank + live community questions + admin edits), keyed by id
  function bank(c) {
    if (cache[c]) return cache[c];
    cache[c] = (async () => {
      let [b, live] = await Promise.all([
        fetch("data/build/" + c + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { papers: {}, questions: [] })),
        A.liveFor ? A.liveFor(c).catch(() => null) : null,
      ]);
      const map = {}, ok = !!live;
      if (!live) live = { submissions: [], overrides: {} };
      const byId = Object.fromEntries(live.submissions.map((x) => [x._id, x]));
      for (const q of b.questions) {
        if (q.submission_id && ok) { const x = byId[q.submission_id]; if (!x || (x.updated || 0) > (q.from_updated || 0)) continue; }
        const o = live.overrides[q.id];
        if (o && o.deleted) continue;
        const p = b.papers[q.paper] || {};
        map[q.id] = { ...q, ...(o && o.fields ? o.fields : {}), _src: q.source ? q.source + (q.credit ? " · submitted by " + q.credit : "") : `${p.label || q.paper}, ${q.ref}`, _answers: p.answers };
      }
      for (const x of live.submissions) if (!map["fs-" + x._id]) map["fs-" + x._id] = { ...x, id: "fs-" + x._id, course: c, _src: (x.source || "Community question") + (x.author ? " · submitted by " + x.author : "") };
      return map;
    })();
    return cache[c];
  }

  const ansLabel = (q) => {
    const t = q.answer_type || q._answers;
    return t === "short" ? "Answer" : t === "sample" || (!q.answer_type && SCI[q.course]) ? "Sample answer" : "Worked solution";
  };
  function card(q, n) {
    const show = showAll || opened.has(q.id);
    const imgs = (q.images || []).map((s) => `<img src="${esc(s)}" alt="Diagram" loading="lazy">`).join("");
    const opts = q.kind === "mc" && (q.options || []).some((o) => String(o).trim()) ? `<div class="opts">${q.options.map((o, i) => `<div class="${show && q.correct === "ABCD"[i] ? "correct" : ""}"><b>(${"ABCD"[i]})</b><span>${md(o, true)}</span></div>`).join("")}</div>` : "";
    const ansImgs = (q.answer_images || []).map((s) => `<img src="${esc(s)}" alt="Solution diagram" loading="lazy">`).join("");
    const prev = (q.prev || []).filter((x) => x.dropped == null);
    return `<article class="q" id="${esc(q.id)}">
      <div class="q-head"><span class="q-title">${n}. <span class="marks">(${q.marks} mark${q.marks === 1 ? "" : "s"})</span></span>
        <span class="diff d${q.difficulty}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= q.difficulty ? "f" : ""}"></i>`).join("")}&nbsp;${DIFF[q.difficulty] || ""}</span><span class="grow"></span>
        <span class="q-actions"><a class="mini" href="${q.course}.html#${encodeURIComponent(q.id)}">Open in ${esc(NAMES[q.course].replace("Mathematics ", ""))}</a><button class="mini save-btn on" data-unsave="${esc(q.id)}">★ Saved</button></span></div>
      ${prev.length ? `<details class="prev-ans"><summary>Show earlier parts (${prev.length})</summary>${prev.map((x) => `<div class="prev-part"><div class="prev-ref">${esc(x.ref)}</div><div class="q-body">${md(x.question)}</div></div>`).join("")}</details>` : ""}
      <div class="q-body">${md(q.question)}${imgs}</div>${opts}
      <div class="src">Source: ${esc(q._src)} · Dot point${(q.dotpoints || []).length > 1 ? "s" : ""} ${dpChips(q.course, q.dotpoints)}</div>
      ${showAll ? "" : `<div class="ans-toggle"><button class="linkish" data-ans="${esc(q.id)}">${show ? "Hide" : "Show"} ${ansLabel(q).toLowerCase()}</button></div>`}
      ${show ? `<div class="ans"><div class="ans-label">${ansLabel(q)}${q.kind === "mc" && q.correct ? " — " + q.correct : ""}</div><div class="ans-body">${md(q.answer)}${ansImgs}</div></div>` : ""}
    </article>`;
  }

  function draw() {
    const list = Q.filter((q) => !filter || q.course === filter);
    const courses = [...new Set(Q.map((q) => q.course))];
    $("saved-tools").hidden = !Q.length;
    if (!Q.length) $("pdf-box").hidden = true;
    $("saved-courses").innerHTML = courses.length > 1 ? [["", "All"], ...courses.map((c) => [c, NAMES[c].replace("Mathematics ", "")])]
      .map(([c, n]) => `<button type="button" class="chip${filter === c ? " on" : ""}" data-course="${c}">${esc(n)} <b>${c ? Q.filter((q) => q.course === c).length : Q.length}</b></button>`).join("") : "";
    if (!Q.length) { $("saved").innerHTML = `<div class="none">No saved questions yet. Press <b>☆ Save</b> on any question to add it here.</div>`; return; }
    let html = "", last = null, n = 0;
    for (const q of list) {
      if (q.course !== last) { html += `<h2 class="topic-h">${esc(NAMES[q.course])}</h2>`; last = q.course; }
      html += card(q, ++n);
    }
    $("saved").innerHTML = `<div class="doc">${html}</div>`;
    if (!$("pdf-box").hidden) pdfCount();
  }

  /* ---------------- PDF of the saved questions shown (respects the subject filter) ---------------- */
  function pdfList() {
    const list = Q.filter((q) => !filter || q.course === filter);
    if ($("pdf-order").value === "diff") return list.slice().sort((a, b) => a.difficulty - b.difficulty);
    return list;
  }
  function pdfCount() {
    const l = pdfList();
    $("pdf-count").textContent = `${l.length} question${l.length === 1 ? "" : "s"} · ${l.reduce((a, q) => a + (+q.marks || 0), 0)} marks`;
  }
  function makePdf() {
    const qs = pdfList();
    if (!qs.length) { toast("No saved questions to print"); return; }
    const courses = [...new Set(qs.map((q) => q.course))];
    const sub = courses.map((c) => NAMES[c]).join(", ");
    const title = $("pdf-title").value.trim() || (courses.length === 1 ? `${NAMES[courses[0]]} — Saved questions` : "Saved questions");
    const ansMode = $("pdf-answers").value, space = $("pdf-space").value, showSrc = $("pdf-src").checked;
    const total = qs.reduce((a, q) => a + (+q.marks || 0), 0);
    let h = `<h1>${esc(title)}</h1><div class="p-sub">${esc(sub)} · ${qs.length} questions · ${total} marks</div>`;
    qs.forEach((q, i) => {
      const opts = q.kind === "mc" && (q.options || []).some((o) => String(o).trim()) ? `<div class="opts ${q.options.every((o) => o.includes("![") || o.length < 38) ? "short" : ""}">${q.options.map((o, k) => `<div><b>(${"ABCD"[k]})</b><span>${md(o, true)}</span></div>`).join("")}</div>` : "";
      const imgs = (q.images || []).map((s) => `<img src="${esc(s)}">`).join("");
      const ansImgs = (q.answer_images || []).map((s) => `<img src="${esc(s)}">`).join("");
      const ans = `<div class="ans"><div class="ans-label">${ansLabel(q)}${q.kind === "mc" && q.correct ? " — " + q.correct : ""}</div><div class="ans-body">${md(q.answer)}${ansImgs}</div></div>`;
      const prev = (q.prev || []).filter((x) => x.dropped == null);
      const prevH = prev.length ? `<div class="p-prev">${prev.map((x) => `<div><b>${esc(x.ref)}</b> ${md(x.question)}</div>`).join("")}</div>` : "";
      h += `<div class="pq"><div class="pq-head">Question ${i + 1} <span>(${q.marks} mark${q.marks === 1 ? "" : "s"})</span></div>${prevH}<div class="q-body">${md(q.question)}${imgs}</div>${opts}`
        + (showSrc ? `<div class="src">${courses.length > 1 ? esc(NAMES[q.course]) + " · " : ""}Source: ${esc(q._src)}</div>` : "")
        + (space !== "none" && q.kind !== "mc" && ansMode !== "inline" ? `<div class="work ${space}"></div>` : "")
        + (ansMode === "inline" ? ans : "") + `</div>`;
    });
    if (ansMode === "end") {
      h += `<div class="key"><h2>Answers</h2>` + qs.map((q, i) => `<div class="pq"><div class="pq-head">Question ${i + 1}</div><div class="ans-body">${q.kind === "mc" && q.correct ? `<p><b>${q.correct}</b></p>` : ""}${q.kind === "mc" && String(q.answer || "").replace(/\*/g, "").trim() === q.correct ? "" : md(q.answer)}${(q.answer_images || []).map((s) => `<img src="${esc(s)}">`).join("")}</div></div>`).join("") + `</div>`;
    }
    const root = $("print-root");
    root.innerHTML = h;
    document.body.classList.add("printing");
    const prevTitle = document.title; document.title = title;
    const waits = [...root.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    Promise.all(waits).then(() => setTimeout(() => {
      window.print();
      setTimeout(() => { document.body.classList.remove("printing"); root.innerHTML = ""; document.title = prevTitle; }, 500);
    }, 150));
  }

  async function render() {
    $("gate").hidden = true;
    if (!A.enabled || !A.user) {
      Q = []; $("saved").innerHTML = ""; $("saved-tools").hidden = true; $("gate").hidden = false;
      $("gate").innerHTML = A.enabled ? `<span>Sign in to see your saved questions.</span><button class="btn primary" type="button" id="g-in">Sign in</button>` : "<span>Logins aren't switched on yet.</span>";
      if ($("g-in")) $("g-in").onclick = () => A.signIn();
      return;
    }
    const my = ++tok;   // ignore stale overlapping renders
    const saved = A.progress.saved || {};
    $("saved").innerHTML = `<div class="soft">Loading…</div>`;
    const byCourse = {};
    for (const [id, c] of Object.entries(saved)) (byCourse[c] = byCourse[c] || []).push(id);
    const order = Object.keys(NAMES);
    const out = [];
    for (const c of order.filter((c) => byCourse[c])) {
      const map = await bank(c);
      const qs = byCourse[c].map((id) => map[id]).filter(Boolean);
      qs.sort((a, b) => String(a.dotpoints[0]).localeCompare(String(b.dotpoints[0]), undefined, { numeric: true }));
      out.push(...qs);
    }
    if (my !== tok) return;
    Q = out; draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("saved").addEventListener("click", async (e) => {
      const a = e.target.closest("[data-ans]");
      if (a) { const id = a.dataset.ans; opened.has(id) ? opened.delete(id) : opened.add(id); draw(); return; }
      const u = e.target.closest("[data-unsave]");
      if (u) {
        const q = Q.find((x) => x.id === u.dataset.unsave);
        try { await A.setSaved(q.id, q.course, false); } catch (err) { toast("Couldn't update — " + err.message); return; }
        Q = Q.filter((x) => x.id !== q.id); draw(); toast("Removed from saved questions");
      }
    });
    $("saved-courses").addEventListener("click", (e) => { const b = e.target.closest("[data-course]"); if (b) { filter = b.dataset.course; draw(); } });
    $("saved-answers").addEventListener("change", (e) => { showAll = e.target.checked; draw(); });
    $("pdf-open").addEventListener("click", () => { const b = $("pdf-box"); b.hidden = !b.hidden; pdfCount(); });
    $("pdf-order").addEventListener("change", pdfCount);
    $("make-pdf").addEventListener("click", makePdf);
    A.ready.then(render);
    if (A.onChange) A.onChange(render); else document.addEventListener("hscauth", render);
  });
})();
