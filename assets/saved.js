/* Better HSC Papers — "Saved questions": the signed-in user's own question bank, across all subjects. */
(function () {
  "use strict";
  const A = window.HSCAuth;
  const { esc, md, dpChips } = window.HSCRender;
  const $ = (id) => document.getElementById(id);
  const NAMES = { standard2: "Mathematics Standard 2", advanced: "Mathematics Advanced", extension1: "Mathematics Extension 1", extension2: "Mathematics Extension 2", physics: "Physics", chemistry: "Chemistry", biology: "Biology" };
  const SCI = { physics: 1, chemistry: 1, biology: 1 };
  const DIFF = ["", "Easy", "Moderate", "Medium", "Hard", "Very hard"];
  const toast = (m) => { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 2600); };
  const cache = {}, syl = {};
  const F = { strict: false, search: "", diff: new Set([1, 2, 3, 4, 5]), kinds: new Set(["mc", "written"]), show: "all", sel: new Set() };   // sel holds "course|dotpoint"
  const isDone = (q) => !!(A.progress && A.progress.done && A.progress.done[q.id]);
  const hay = (q) => (q._h = q._h || (String(q.question) + " " + (q.options || []).join(" ") + " " + (q._src || "") + " " + (q.ref || "")).toLowerCase());
  function passes(q, skipCourse, skipTopic, skipShow) {
    if (!skipCourse && filter && q.course !== filter) return false;
    if (!F.diff.has(q.difficulty) || !F.kinds.has(q.kind)) return false;
    if (F.search) for (const w of F.search.split(/\s+/)) if (w && !hay(q).includes(w)) return false;
    if (!skipShow && F.show !== "all" && isDone(q) !== (F.show === "done")) return false;
    if (!skipTopic && F.sel.size && !(q.dotpoints || []).some((d) => F.sel.has(q.course + "|" + d))) return false;
    if (!skipTopic && F.sel.size && F.strict && !(q.dotpoints || []).every((d) => F.sel.has(q.course + "|" + d))) return false;
    return true;
  }
  const visible = () => Q.filter((q) => passes(q));
  let Q = [], filter = "", opened = new Set(), showAll = false, tok = 0;
  let sortBy = (() => { try { return localStorage.getItem("hscq:savedSort") || "syllabus"; } catch (e) { return "syllabus"; } })();
  const num = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  const dp0 = (q) => (q.dotpoints || [])[0] || "";
  const savedAt = (q) => ((A.progress && A.progress.savedAt) || {})[q.id] || 0;
  // within each subject (subjects stay grouped under their headings), ties fall back to syllabus order
  const SORTS = {
    syllabus: () => 0,
    recent: (a, b) => savedAt(b) - savedAt(a),
    oldest: (a, b) => savedAt(a) - savedAt(b),
    easy: (a, b) => a.difficulty - b.difficulty,
    hard: (a, b) => b.difficulty - a.difficulty,
    "marks-high": (a, b) => (+b.marks || 0) - (+a.marks || 0),
    "marks-low": (a, b) => (+a.marks || 0) - (+b.marks || 0),
    paper: (a, b) => num(a._src, b._src),
  };
  const ORDER = Object.keys(NAMES);
  function sorted(list) {
    const f = SORTS[sortBy] || SORTS.syllabus;
    return list.slice().sort((a, b) => ORDER.indexOf(a.course) - ORDER.indexOf(b.course) || f(a, b) || num(dp0(a), dp0(b)));
  }
  // questions left out of the PDF (everything saved is included until unticked); remembered in this browser
  const skip = new Set((() => { try { return JSON.parse(localStorage.getItem("hscq:savedSkip") || "[]"); } catch (e) { return []; } })());
  const keepSkip = () => { try { localStorage.setItem("hscq:savedSkip", JSON.stringify([...skip])); } catch (e) {} };

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
        <span class="q-actions"><label class="pick"><input type="checkbox" data-pick="${esc(q.id)}" ${skip.has(q.id) ? "" : "checked"}> Include in PDF</label><a class="mini" href="${q.course}.html#${encodeURIComponent(q.id)}">Open in ${esc(NAMES[q.course].replace("Mathematics ", ""))}</a><button class="mini save-btn on" data-unsave="${esc(q.id)}">★ Saved</button></span></div>
      ${prev.length ? `<details class="prev-ans"><summary>Show earlier parts (${prev.length})</summary>${prev.map((x) => `<div class="prev-part"><div class="prev-ref">${esc(x.ref)}</div><div class="q-body">${md(x.question)}${(x.images || []).map((s) => `<img src="${esc(s)}" alt="Diagram" loading="lazy">`).join("")}</div></div>`).join("")}</details>` : ""}
      <div class="q-body">${md(q.question)}${imgs}</div>${opts}
      <div class="src">Source: ${esc(q._src)} · Dot point${(q.dotpoints || []).length > 1 ? "s" : ""} ${dpChips(q.course, q.dotpoints)}</div>
      ${showAll ? "" : `<div class="ans-toggle"><button class="linkish" data-ans="${esc(q.id)}">${show ? "Hide" : "Show"} ${ansLabel(q).toLowerCase()}</button></div>`}
      ${show ? `<div class="ans"><div class="ans-label">${ansLabel(q)}${q.kind === "mc" && q.correct ? " — " + q.correct : ""}</div><div class="ans-body">${md(q.answer)}${ansImgs}</div></div>` : ""}
    </article>`;
  }

  function draw() {
    const list = sorted(visible());
    const courses = [...new Set(Q.map((q) => q.course))];
    $("saved-tools").hidden = !Q.length;
    $("sidebar").hidden = !Q.length;
    if (!Q.length) $("pdf-box").hidden = true;
    const base = Q.filter((q) => passes(q, true));
    $("saved-courses").innerHTML = courses.length > 1 ? [["", "All"], ...courses.map((c) => [c, NAMES[c].replace("Mathematics ", "")])]
      .map(([c, n]) => `<button type="button" class="chip${filter === c ? " on" : ""}" data-course="${c}">${esc(n)} <b>${c ? base.filter((q) => q.course === c).length : base.length}</b></button>`).join("") : "";
    $("subj-panel").hidden = courses.length < 2;
    $("saved-count").textContent = Q.length ? `${list.length} of ${Q.length} saved question${Q.length === 1 ? "" : "s"} shown` : "";
    updProgress(); buildTree();
    if (!Q.length) { $("saved").innerHTML = `<div class="none">No saved questions yet. Press <b>☆ Save</b> on any question to add it here.</div>`; return; }
    if (!list.length) { $("saved").innerHTML = `<div class="none">No saved questions match these filters.</div>`; return; }
    let html = "", last = null, n = 0;
    for (const q of list) {
      if (q.course !== last) { html += `<h2 class="topic-h subj-h"><span>${esc(NAMES[q.course])}</span><label class="pick subj-pick"><input type="checkbox" data-subj="${q.course}"> Include all in PDF</label></h2>`; last = q.course; }
      html += card(q, ++n);
    }
    $("saved").innerHTML = `<div class="doc">${html}</div>`;
    syncSubj();
    if (!$("pdf-box").hidden) pdfCount();
  }

  function updProgress() {
    const pool = Q.filter((q) => passes(q, false, false, true)), n = pool.filter(isDone).length, pct = pool.length ? Math.round((100 * n) / pool.length) : 0;
    $("done-count").innerHTML = `<div class="prog-line"><span>${n} of ${pool.length} questions done</span><b>${pct}%</b></div><div class="prog-bar"><i style="width:${pct}%"></i></div>`;
    document.querySelectorAll("#show-done button").forEach((b) => b.classList.toggle("on", b.dataset.show === F.show));
  }

  /* ---------------- topics & dot points tree (built from the syllabus of each saved subject) ---------------- */
  async function loadSyl(c) {
    if (!syl[c]) syl[c] = fetch("data/syllabus/" + c + ".json").then((r) => r.json()).catch(() => null);
    return syl[c];
  }
  function buildTree() {
    const root = $("tree");
    const open = new Set([...root.querySelectorAll("details[open]")].map((d) => d.dataset.key));
    const cnt = {};   // course|dp -> ids, over everything except the topic filter
    for (const q of Q) if (passes(q, false, true)) for (const d of q.dotpoints || []) (cnt[q.course + "|" + d] = cnt[q.course + "|" + d] || new Set()).add(q.id);
    const courses = Object.keys(NAMES).filter((c) => Q.some((q) => q.course === c));
    let html = "";
    for (const c of courses) {
      const sy = syl[c] && syl[c].then ? null : syl[c];
      if (!sy) continue;
      let cSet = new Set(), cHtml = "";
      for (const y of sy.years) for (const t of y.topics) {
        let tSet = new Set(), tHtml = "";
        for (const sb of t.subtopics) {
          let sSet = new Set(), sHtml = "";
          for (const p of sb.dotpoints) {
            const k = c + "|" + p.id, n = cnt[k] ? cnt[k].size : 0; if (!n) continue;
            cnt[k].forEach((x) => { sSet.add(x); tSet.add(x); cSet.add(x); });
            sHtml += `<label class="dp" title="${esc(p.text.replace(/\$/g, ""))}"><input type="checkbox" data-dp="${esc(k)}" ${F.sel.has(k) ? "checked" : ""}><span class="lbl"><span class="id">${p.id}</span> <span class="md-inline" data-md="${esc(p.text)}"></span></span><span class="cnt">${n}</span></label>`;
          }
          if (!sSet.size) continue;
          const key = "s" + c + sb.id, multi = !(sb.name === t.name && t.subtopics.length === 1);
          tHtml += multi ? `<details class="lvl-sub" data-key="${key}" ${open.has(key) ? "open" : ""}><summary><span class="caret">▸</span><span class="lbl">${esc(sb.name)}</span><span class="cnt">${sSet.size}</span></summary><div class="kids">${sHtml}</div></details>` : sHtml;
        }
        if (!tSet.size) continue;
        const key = "t" + c + t.id;
        cHtml += `<details class="lvl-topic" data-key="${key}" ${open.has(key) ? "open" : ""}><summary><span class="caret">▸</span><span class="lbl">${esc(t.name)}</span><span class="cnt">${tSet.size}</span></summary><div class="kids">${tHtml}</div></details>`;
      }
      if (!cSet.size) continue;
      const key = "c" + c;
      html += courses.length > 1 ? `<details class="lvl-year" data-key="${key}" ${open.has(key) || !root.dataset.built ? "open" : ""}><summary><span class="caret">▸</span><span class="lbl">${esc(NAMES[c])}</span><span class="cnt">${cSet.size}</span></summary>${cHtml}</details>` : cHtml;
    }
    root.innerHTML = html || `<div class="none" style="padding:10px">No saved questions match.</div>`;
    root.dataset.built = "1";
    root.querySelectorAll(".md-inline").forEach((el) => { el.innerHTML = md(el.dataset.md, true); });
  }

  // each subject heading's box: ticked if all its questions are in the PDF, dashed if only some
  function syncSubj() {
    document.querySelectorAll("#saved [data-subj]").forEach((box) => {
      const qs = Q.filter((q) => q.course === box.dataset.subj), on = qs.filter((q) => !skip.has(q.id)).length;
      box.checked = on === qs.length && on > 0; box.indeterminate = on > 0 && on < qs.length;
    });
  }

  /* ---------------- PDF of the saved questions shown (respects the subject filter) ---------------- */
  function pdfList() {
    const list = sorted(visible().filter((q) => !skip.has(q.id)));
    if ($("pdf-order").value === "diff") return list.slice().sort((a, b) => a.difficulty - b.difficulty);
    return list;
  }
  function pdfCount() {
    const l = pdfList(), shown = visible().length;
    $("pdf-count").textContent = `${l.length} of ${shown} selected · ${l.reduce((a, q) => a + (+q.marks || 0), 0)} marks`;
  }
  function makePdf() {
    const qs = pdfList();
    if (!qs.length) { toast("Tick “Include in PDF” on at least one question"); return; }
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
      const prevH = prev.length ? `<div class="p-prev">${prev.map((x) => `<div><b>${esc(x.ref)}</b> ${md(x.question)}${(x.images || []).map((s) => `<img src="${esc(s)}">`).join("")}</div>`).join("")}</div>` : "";
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
      Q = []; $("saved").innerHTML = ""; $("saved-tools").hidden = true; $("sidebar").hidden = true; $("gate").hidden = false;
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
      out.push(...byCourse[c].map((id) => map[id]).filter(Boolean));
    }
    await Promise.all([...new Set(out.map((q) => q.course))].map(async (c) => { syl[c] = await loadSyl(c); }));
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
    $("saved").addEventListener("change", (e) => {
      const c = e.target.dataset.subj;
      if (c) { for (const q of visible()) if (q.course === c) e.target.checked ? skip.delete(q.id) : skip.add(q.id); keepSkip(); draw(); pdfCount(); return; }
      const id = e.target.dataset.pick; if (!id) return;
      e.target.checked ? skip.delete(id) : skip.add(id); keepSkip(); syncSubj(); pdfCount();
    });
    const pickAll = (on) => { for (const q of visible()) on ? skip.delete(q.id) : skip.add(q.id); keepSkip(); draw(); pdfCount(); };
    $("pick-all").addEventListener("click", () => pickAll(true));
    $("pick-none").addEventListener("click", () => pickAll(false));
    const side = $("sidebar"), scrim = $("scrim");
    const closeSide = () => { side.classList.remove("show"); scrim.classList.remove("show"); document.documentElement.classList.remove("panel-open"); };
    $("filters-open").addEventListener("click", () => { side.classList.add("show"); scrim.classList.add("show"); document.documentElement.classList.add("panel-open"); side.scrollTop = 0; });
    scrim.addEventListener("click", closeSide);
    let st; $("search").addEventListener("input", (e) => { clearTimeout(st); st = setTimeout(() => { F.search = e.target.value.trim().toLowerCase(); draw(); }, 200); });
    side.addEventListener("click", (e) => {
      const d = e.target.closest("[data-diff]");
      if (d) { const v = +d.dataset.diff; F.diff.has(v) ? F.diff.delete(v) : F.diff.add(v); d.classList.toggle("on", F.diff.has(v)); draw(); return; }
      const k = e.target.closest("[data-kind]");
      if (k) { const v = k.dataset.kind; F.kinds.has(v) ? F.kinds.delete(v) : F.kinds.add(v); k.classList.toggle("on", F.kinds.has(v)); draw(); return; }
      const sh = e.target.closest("[data-show]");
      if (sh) { F.show = sh.dataset.show; draw(); }
    });
    $("tree").addEventListener("change", (e) => {
      const k = e.target.dataset.dp; if (!k) return;
      e.target.checked ? F.sel.add(k) : F.sel.delete(k); draw();
    });
    $("strict-dp").addEventListener("change", (e) => { F.strict = e.target.checked; draw(); });
    $("clear-topics").addEventListener("click", () => { F.sel.clear(); draw(); });
    $("reset").addEventListener("click", () => {
      F.search = ""; $("search").value = ""; F.diff = new Set([1, 2, 3, 4, 5]); F.kinds = new Set(["mc", "written"]); F.show = "all"; F.sel.clear(); filter = "";
      side.querySelectorAll("[data-diff],[data-kind]").forEach((b) => b.classList.add("on")); draw();
    });
    $("saved-courses").addEventListener("click", (e) => { const b = e.target.closest("[data-course]"); if (b) { filter = b.dataset.course; draw(); } });
    const ss = $("saved-sort"); ss.value = SORTS[sortBy] ? sortBy : "syllabus";
    ss.addEventListener("change", () => { sortBy = ss.value; try { localStorage.setItem("hscq:savedSort", sortBy); } catch (e) {} draw(); });
    $("saved-answers").addEventListener("change", (e) => { showAll = e.target.checked; draw(); });
    $("pdf-open").addEventListener("click", () => { const b = $("pdf-box"); b.hidden = !b.hidden; pdfCount(); });
    $("pdf-order").addEventListener("change", pdfCount);
    $("make-pdf").addEventListener("click", makePdf);
    A.ready.then(render);
    if (A.onChange) A.onChange(render); else document.addEventListener("hscauth", render);
  });
})();
