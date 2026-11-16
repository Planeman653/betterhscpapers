/* Better HSC Papers — course page app.  No build step. */
(function () {
  "use strict";
  const COURSE = document.body.dataset.course;
  const COURSE_NAME = {
    advanced: "Mathematics Advanced",
    extension1: "Mathematics Extension 1",
    extension2: "Mathematics Extension 2",
    physics: "Physics",
    chemistry: "Chemistry",
    biology: "Biology",
  }[COURSE];
  const SCIENCE = COURSE === "physics" || COURSE === "chemistry" || COURSE === "biology";
  const DIFF = ["", "Easy", "Moderate", "Medium", "Hard", "Very hard"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("hscq:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("hscq:" + k, JSON.stringify(v)); } catch (e) {} },
  };

  const S = {
    syl: null, data: null, dp: {}, sub: {}, topic: {}, order: {},
    sel: new Set(),                       // selected dot point ids (empty = all)
    diff: new Set([1, 2, 3, 4, 5]),
    kinds: new Set(["mc", "written"]),
    papers: new Set(),                    // selected paper ids (empty = all)
    search: "",
    sort: "syllabus",
    group: "subtopic",
    showAnswers: store.get("showAnswers", false),
    hideEmpty: true,
    basket: new Set(store.get("basket:" + COURSE, [])),
    opened: new Set(),                    // per-question answers opened manually
    prevOpen: new Set(),                  // per-question "previous parts" opened
    show: store.get("showDone", store.get("hideDone", false) ? "todo" : "all"),   // all | todo | done
    perPage: store.get("perPage", 50),     // 0 = all
    page: 0,
    overrides: {},
  };
  const A = window.HSCAuth || { enabled: false, user: null, progress: { done: {}, flagged: {} } };
  const isDone = (id) => !!(A.user && A.progress && A.progress.done[id]);
  const isFlagged = (id) => !!(A.user && A.progress && A.progress.flagged[id]);
  const isSaved = (id) => !!(A.user && A.progress && A.progress.saved && A.progress.saved[id]);
  const canEdit = (q) => !!(A.user && (A.isAdmin || (q.live && q.owner === A.user.uid)));

  /* ---------------- markdown + maths ---------------- */
  const { esc, md } = window.HSCRender;

  /* ---------------- data ---------------- */
  async function load() {
    const [syl, data] = await Promise.all([
      fetch("data/syllabus/" + COURSE + ".json").then((r) => r.json()),
      fetch("data/build/" + COURSE + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { papers: {}, questions: [] })),
    ]);
    S.syl = syl; S.data = data;
    let n = 0;
    for (const y of syl.years) for (const t of y.topics) {
      S.topic[t.id] = { ...t, year: y.year };
      for (const s of t.subtopics) {
        S.sub[s.id] = { ...s, topic: t.id };
        for (const p of s.dotpoints) { S.dp[p.id] = { ...p, sub: s.id, topic: t.id }; S.order[p.id] = n++; }
      }
    }
    addMine(data);
    await mergeLive(data);
    for (const q of data.questions) {
      q._order = S.order[q.dotpoints[0]] ?? 1e9;
      q._paper = data.papers[q.paper] || { label: q.paper, year: 0 };
      q._text = (q.question + " " + (q.options || []).join(" ") + " " + q._paper.label + " " + q.ref).toLowerCase();
    }
    for (const id of [...S.basket]) if (!data.questions.find((q) => q.id === id)) S.basket.delete(id);
  }

  // Questions the user wrote on submit.html are kept in this browser and shown alongside the bank.
  function addMine(data) {
    const live = new Set(data.questions.filter((q) => q.client_id).map((q) => q.client_id));   // already published for everyone
    const mine = store.get("mine", []).filter((m) => m && m.course === COURSE && !live.has(m.id) && m.dotpoints && m.dotpoints.some((d) => S.dp[d]));
    if (!mine.length) return;
    data.papers.mine = { id: "mine", course: COURSE, school: "Your questions", year: 9999, type: "", label: "Your questions", answers: "worked" };
    mine.forEach((m, i) => {
      const dps = m.dotpoints.filter((d) => S.dp[d]);
      data.questions.push({ ...m, dotpoints: dps, paper: "mine", mine: true, seq: i + 1, ref: m.ref || "Your question",
        topic: S.dp[dps[0]].topic, subtopic: S.dp[dps[0]].sub, images: m.images || [], answer_images: m.answer_images || [] });
    });
  }

  // Community questions published from submit.html (Firestore) and admin edits/deletions, merged in at load.
  async function mergeLive(data) {
    await Promise.race([A.ready, new Promise((r) => setTimeout(r, 4000))]);
    if (!A.enabled || !A.liveFor) return;
    let live;
    try { live = await A.liveFor(COURSE); } catch (e) { console.warn("live questions", e); return; }
    S.overrides = live.overrides;
    const subs = live.submissions.filter((x) => Array.isArray(x.dotpoints) && x.dotpoints.some((d) => S.dp[d]) && x.question);
    if (subs.length) {
      const pid = "community-" + COURSE;
      if (!data.papers[pid]) data.papers[pid] = { id: pid, course: COURSE, school: "Community", year: new Date().getFullYear(), type: "Submitted", label: "Community submissions", answers: "worked" };
      subs.sort((a, b) => (a.created || 0) - (b.created || 0)).forEach((x, i) => {
        const dps = x.dotpoints.filter((d) => S.dp[d]);
        data.questions.push({
          id: "fs-" + x._id, fsid: x._id, paper: pid, seq: 1000 + i, ref: "Community question", course: COURSE,
          kind: x.kind === "mc" ? "mc" : "written", marks: Math.max(1, +x.marks || 1), difficulty: Math.min(5, Math.max(1, +x.difficulty || 3)),
          dotpoints: dps, topic: S.dp[dps[0]].topic, subtopic: S.dp[dps[0]].sub,
          question: String(x.question || ""), options: Array.isArray(x.options) ? x.options.map(String) : undefined, correct: x.correct,
          answer: String(x.answer || ""), answer_type: x.answer_type, images: x.images || [], answer_images: x.answer_images || [],
          prev: Array.isArray(x.prev) ? x.prev : [], source: x.source || "Community question", credit: x.author, owner: x.uid, live: true,
        });
      });
    }
    data.questions = data.questions.filter((q) => !(live.overrides[q.id] && live.overrides[q.id].deleted));
    for (const q of data.questions) {
      const o = live.overrides[q.id];
      if (!o || !o.fields) continue;
      Object.assign(q, o.fields);
      q.edited = true;
      const dps = (q.dotpoints || []).filter((d) => S.dp[d]);
      if (dps.length) { q.dotpoints = dps; q.topic = S.dp[dps[0]].topic; q.subtopic = S.dp[dps[0]].sub; }
    }
  }

  /* ---------------- filtering ---------------- */
  function passesNonTopic(q) {
    if (!S.diff.has(q.difficulty)) return false;
    if (!S.kinds.has(q.kind)) return false;
    if (S.papers.size && !S.papers.has(q.paper)) return false;
    if (S.search) for (const w of S.search.split(/\s+/)) if (w && !q._text.includes(w)) return false;
    return true;
  }
  function passes(q) {
    if (!passesNonTopic(q)) return false;
    if (A.user && S.show !== "all" && isDone(q.id) !== (S.show === "done")) return false;
    if (S.sel.size && !q.dotpoints.some((d) => S.sel.has(d))) return false;
    return true;
  }
  function sorted(list) {
    const by = {
      syllabus: (a, b) => a._order - b._order || b._paper.year - a._paper.year || a.seq - b.seq,
      "diff-asc": (a, b) => a.difficulty - b.difficulty || a._order - b._order,
      "diff-desc": (a, b) => b.difficulty - a.difficulty || a._order - b._order,
      newest: (a, b) => b._paper.year - a._paper.year || a.paper.localeCompare(b.paper) || a.seq - b.seq,
      marks: (a, b) => a.marks - b.marks || a._order - b._order,
    }[S.sort];
    return list.slice().sort(by);
  }

  /* ---------------- sidebar ---------------- */
  function dpCounts() {
    const c = {};
    for (const q of S.data.questions) if (passesNonTopic(q)) for (const d of q.dotpoints) (c[d] = c[d] || new Set()).add(q.id);
    return c;
  }
  function buildTree() {
    const c = dpCounts();
    const root = document.getElementById("tree");
    const openState = new Set([...root.querySelectorAll("details[open]")].map((d) => d.dataset.key));
    const firstBuild = !root.dataset.built;
    let html = "";
    for (const y of S.syl.years) {
      let yHtml = "", ySet = new Set();
      for (const t of y.topics) {
        let tHtml = "", tSet = new Set();
        for (const s of t.subtopics) {
          let sHtml = "", sSet = new Set();
          for (const p of s.dotpoints) {
            const n = c[p.id] ? c[p.id].size : 0; if (n) c[p.id].forEach((x) => { sSet.add(x); tSet.add(x); ySet.add(x); });
            if (S.hideEmpty && !n) continue;
            sHtml += `<label class="dp ${n ? "" : "empty"}" title="${esc(p.text.replace(/\$/g, ""))}"><input type="checkbox" data-dp="${p.id}" ${S.sel.has(p.id) ? "checked" : ""}><span class="lbl"><span class="id">${p.id}</span> <span class="md-inline" data-md="${esc(p.text)}"></span></span><span class="cnt">${n}</span></label>`;
          }
          const sCount = sSet.size;
          if (S.hideEmpty && !sCount) continue;
          const key = "s" + s.id;
          const multi = !(s.name === t.name && t.subtopics.length === 1);
          tHtml += multi
            ? `<details class="lvl-sub" data-key="${key}" ${openState.has(key) ? "open" : ""}><summary><span class="caret">▸</span><input type="checkbox" data-group="${s.id}"><span class="lbl">${esc(s.name)}</span><span class="cnt">${sCount}</span></summary><div class="kids">${sHtml}</div></details>`
            : sHtml;
        }
        const tCount = tSet.size;
        if (S.hideEmpty && !tCount) continue;
        const key = "t" + t.id;
        yHtml += `<details class="lvl-topic" data-key="${key}" ${openState.has(key) ? "open" : ""}><summary><span class="caret">▸</span><input type="checkbox" data-group="${t.id}"><span class="lbl">${esc(t.name)}</span><span class="cnt">${tCount}</span></summary><div class="kids">${tHtml}</div></details>`;
      }
      const yCount = ySet.size;
      if (S.hideEmpty && !yCount) continue;
      const key = "y" + y.year;
      const open = firstBuild || openState.has(key);
      html += S.syl.years.length > 1
        ? `<details class="lvl-year" data-key="${key}" ${open ? "open" : ""}><summary><span class="caret">▸</span><span class="lbl">Year ${y.year}</span><span class="cnt">${yCount}</span></summary>${yHtml}</details>`
        : yHtml;
    }
    root.innerHTML = html || `<div class="none" style="padding:10px">No indexed questions yet.</div>`;
    root.dataset.built = "1";
    root.querySelectorAll(".md-inline").forEach((el) => { el.innerHTML = md(el.dataset.md, true); });
    syncGroupBoxes();
  }
  function dpsUnder(prefix) { return Object.keys(S.dp).filter((id) => id === prefix || id.startsWith(prefix + ".")); }
  function syncGroupBoxes() {
    document.querySelectorAll("#tree input[data-group]").forEach((box) => {
      const ids = dpsUnder(box.dataset.group);
      const on = ids.filter((i) => S.sel.has(i)).length;
      box.checked = on > 0 && on === ids.length;
      box.indeterminate = on > 0 && on < ids.length;
    });
  }
  function buildPapers() {
    const papers = Object.values(S.data.papers).sort((a, b) => b.year - a.year || a.school.localeCompare(b.school));
    const counts = {};
    for (const q of S.data.questions) counts[q.paper] = (counts[q.paper] || 0) + 1;
    document.getElementById("papers").innerHTML = papers.length
      ? papers.map((p) => `<label class="switch" style="font-size:13.5px;margin:3px 0"><input type="checkbox" data-paper="${p.id}" ${S.papers.has(p.id) ? "checked" : ""}> ${esc(p.label)}${p.course !== COURSE ? ` <span class="cnt">(${esc(shortCourse(p.course))} paper)</span>` : ""} <span class="cnt" style="color:var(--faint)">${counts[p.id] || 0}</span></label>`).join("")
      : `<span class="cnt">None yet</span>`;
  }
  const shortCourse = (c) => ({ advanced: "Adv", extension1: "Ext 1", extension2: "Ext 2", physics: "Physics", chemistry: "Chemistry", biology: "Biology" }[c] || c);

  /* ---------------- main document ---------------- */
  function qHtml(q, num) {
    const p = q._paper;
    const opts = q.kind === "mc" && q.options ? (() => {
      const short = q.options.every((o) => o.includes("![") || o.replace(/\$[^$]*\$/g, "xxxx").length < 38);
      return `<div class="opts ${short ? "short" : ""}">${q.options.map((o, i) => {
        const L = "ABCD"[i];
        return `<div class="${(S.showAnswers || S.opened.has(q.id)) && q.correct === L ? "correct" : ""}"><b>(${L})</b><span>${md(o, true)}</span></div>`;
      }).join("")}</div>`;
    })() : "";
    const imgs = (q.images || []).map((s) => `<img src="${esc(s)}" alt="Diagram for ${esc(q.ref)}" loading="lazy">`).join("");
    const show = S.showAnswers || S.opened.has(q.id);
    const ansImgs = (q.answer_images || []).map((s) => `<img src="${esc(s)}" alt="Solution diagram" loading="lazy">`).join("");
    const ansLabel = ansLabelOf(q);
    const ans = show ? `<div class="ans"><div class="ans-label">${ansLabel}${q.kind === "mc" && q.correct ? " — " + q.correct : ""}</div><div class="ans-body">${q.kind === "mc" && q.answer.replace(/\*/g, "").trim() === q.correct ? "" : md(q.answer)}${ansImgs}</div></div>` : "";
    const dps = q.dotpoints.map((d) => d).join(", ");
    const prev = q.prev || [];
    const prevShown = S.prevOpen.has(q.id);
    const prevBtn = prev.length ? `<button class="prev-btn${prevShown ? " on" : ""}" data-prev="${q.id}" aria-expanded="${prevShown}">${prevShown ? "Hide" : "Show"} previous part${prev.length === 1 ? "" : "s"} (${prev.length})</button>` : "";
    const prevBlock = prev.length && prevShown ? `<div class="prev-parts"><div class="prev-label">Earlier parts of this question${q.mine || q.source ? "" : " — " + esc(p.label)}</div>${prev.map(prevHtml).join("")}</div>` : "";
    return `<article class="q${isDone(q.id) ? " is-done" : ""}" id="${q.id}">
      <div class="q-head"><span class="q-title">Question ${num} <span class="marks">(${q.marks} mark${q.marks === 1 ? "" : "s"})</span></span>
        <span class="diff d${q.difficulty}" title="Difficulty ${q.difficulty}/5 — ${DIFF[q.difficulty]}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= q.difficulty ? "f" : ""}"></i>`).join("")}&nbsp;${DIFF[q.difficulty]}</span>
        <span class="grow"></span>
        <span class="q-actions"><label class="pick"><input type="checkbox" data-pick="${q.id}" ${S.basket.has(q.id) ? "checked" : ""}> Add to PDF</label>${prevBtn}</span></div>
      ${A.enabled ? `<div class="q-tools"><button class="mini done-btn${isDone(q.id) ? " on" : ""}" data-done="${q.id}" title="Tick off questions you've done">${isDone(q.id) ? "✓ Done" : "Mark done"}</button><button class="mini save-btn${isSaved(q.id) ? " on" : ""}" data-save="${q.id}" title="Save to your question bank">${isSaved(q.id) ? "★ Saved" : "☆ Save"}</button>${canEdit(q) ? `<a class="mini" href="submit.html?edit=${encodeURIComponent(q.id)}&amp;course=${COURSE}">Edit</a><button class="mini danger" data-qdel="${q.id}">Delete</button>` : ""}${q.edited && A.isAdmin ? '<span class="tag">Edited</span>' : ""}</div>` : ""}
      ${prevBlock}<div class="q-body">${md(q.question)}${imgs}</div>${opts}
      <div class="src">${q.mine ? '<span class="tag">Yours</span> ' : q.source ? '<span class="tag">Community</span> ' : ""}Source: ${sourceOf(q)}${q.kind === "mc" ? " (multiple choice)" : ""} · <span class="dps">Dot point${q.dotpoints.length > 1 ? "s" : ""} ${dps}</span></div>
      ${S.showAnswers ? "" : `<div class="ans-toggle"><button class="linkish" data-ans="${q.id}">${show ? "Hide" : "Show"} ${ansLabel.toLowerCase()}</button></div>`}
      ${ans}${A.enabled ? `<button class="report-btn${isFlagged(q.id) ? " on" : ""}" data-flag="${q.id}" title="${isFlagged(q.id) ? "You reported this question" : "Report a problem with this question"}" aria-label="Report a problem with this question">⚠</button>` : ""}</article>`;
  }

  function ansLabelOf(q) {
    // an explicit per-question answer_type wins; otherwise science papers are "Sample answer"
    if (q.answer_type) return q.answer_type === "short" ? "Answer" : q.answer_type === "sample" ? "Sample answer" : "Worked solution";
    const t = q._paper.answers;
    return t === "short" ? "Answer" : SCIENCE || t === "sample" ? "Sample answer" : "Worked solution";
  }
  function sourceOf(q) {
    if (q.mine) return `Your question${q.source ? " · " + esc(q.source) : ""} · <a href="submit.html?edit=${encodeURIComponent(q.id)}">Edit</a>`;
    if (q.source) return `${esc(q.source)}${q.credit ? " · submitted by " + esc(q.credit) : ""}${q.live && A.user && q.owner === A.user.uid ? ' · <span class="tag">Yours</span>' : ""}${q.issue ? ` · <a href="https://github.com/Planeman653/betterhscpapers/issues/${+q.issue}" title="Edit or report this question">#${+q.issue}</a>` : ""}`;
    return `${esc(q._paper.label)}, ${esc(q.ref)}`;
  }

  function prevHtml(x) {
    if (x.dropped != null) return `<div class="prev-part dropped"><div class="prev-ref">${esc(x.ref)}</div><div class="prev-note">Not included on this site${x.dropped ? ": " + esc(x.dropped) : ""}.</div></div>`;
    const opts = x.kind === "mc" && x.options ? `<div class="opts">${x.options.map((o, i) => `<div><b>(${"ABCD"[i]})</b><span>${md(o, true)}</span></div>`).join("")}</div>` : "";
    const imgs = (x.images || []).map((s) => `<img src="${esc(s)}" alt="Diagram for ${esc(x.ref)}" loading="lazy">`).join("");
    const ansImgs = (x.answer_images || []).map((s) => `<img src="${esc(s)}" alt="Solution diagram" loading="lazy">`).join("");
    const ans = `<details class="prev-ans"><summary>Show ${SCIENCE ? "sample answer" : "solution"}</summary><div class="ans"><div class="ans-body">${x.kind === "mc" && x.correct ? `<p><b>${x.correct}</b></p>` : ""}${x.kind === "mc" && String(x.answer).replace(/\*/g, "").trim() === x.correct ? "" : md(x.answer)}${ansImgs}</div></div></details>`;
    return `<div class="prev-part"><div class="prev-ref">${esc(x.ref)} <span class="marks">(${x.marks} mark${x.marks === 1 ? "" : "s"})</span></div><div class="q-body">${md(x.question)}${imgs}</div>${opts}${ans}</div>`;
  }

  function groupKey(q) {
    if (S.group === "dotpoint") return q.dotpoints[0];
    if (S.group === "subtopic") return q.subtopic;
    return "all";
  }

  // Filtered questions in display order (topic → group → sort), each with its topic and group key.
  function ordered() {
    const list = sorted(S.data.questions.filter(passes));
    const topics = new Map();
    for (const q of list) {
      const t = S.group === "none" ? "_" : q.topic;
      if (!topics.has(t)) topics.set(t, new Map());
      const g = groupKey(q), gm = topics.get(t);
      if (!gm.has(g)) gm.set(g, []);
      gm.get(g).push(q);
    }
    const tOrder = (id) => (id === "_" ? 0 : S.order[Object.keys(S.dp).find((d) => d.startsWith(id + "."))] ?? 1e9);
    const gOrder = (id) => (S.group === "dotpoint" ? S.order[id] : S.order[Object.keys(S.dp).find((d) => d.startsWith(id + "."))]) ?? 1e9;
    const tKeys = [...topics.keys()].sort((a, b) => (S.sort === "syllabus" || S.group !== "none" ? tOrder(a) - tOrder(b) : 0));
    const out = [];
    for (const t of tKeys) {
      const gm = topics.get(t);
      for (const g of [...gm.keys()].sort((a, b) => gOrder(a) - gOrder(b))) for (const q of gm.get(g)) out.push({ q, t, g });
    }
    return out;
  }
  const perPage = () => (S.perPage > 0 ? S.perPage : Infinity);
  function pageOf(id) { const i = ordered().findIndex((x) => x.q.id === id); return i < 0 ? -1 : Math.floor(i / perPage()); }

  function pagerHtml(total, pages) {
    if (pages <= 1) return "";
    const from = S.page * perPage() + 1, to = Math.min(total, (S.page + 1) * perPage());
    const nums = [];
    for (let p = 0; p < pages; p++) {
      if (p === 0 || p === pages - 1 || Math.abs(p - S.page) <= 2) nums.push(p);
      else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return `<nav class="pager" aria-label="Pages"><button class="btn" data-page="${S.page - 1}" ${S.page === 0 ? "disabled" : ""}>‹ Prev</button>
      <span class="pages">${nums.map((p) => (p === "…" ? `<span class="soft">…</span>` : `<button class="pg${p === S.page ? " on" : ""}" data-page="${p}" ${p === S.page ? 'aria-current="page"' : ""}>${p + 1}</button>`)).join("")}</span>
      <button class="btn" data-page="${S.page + 1}" ${S.page >= pages - 1 ? "disabled" : ""}>Next ›</button>
      <span class="soft pager-info">Questions ${from}–${to} of ${total}</span></nav>`;
  }

  function render() {
    const all = ordered();
    document.getElementById("count").textContent = `${all.length} question${all.length === 1 ? "" : "s"} · ${all.reduce((a, x) => a + x.q.marks, 0)} marks`;
    const docEl = document.getElementById("questions");
    const contentsEl = document.getElementById("contents");
    if (!all.length) {
      docEl.innerHTML = `<div class="none">No questions match these filters.</div>`;
      contentsEl.innerHTML = ""; return;
    }
    const pages = Math.max(1, Math.ceil(all.length / perPage()));
    S.page = Math.min(Math.max(0, S.page || 0), pages - 1);
    const start = S.page * perPage(), slice = all.slice(start, start + perPage());
    // contents: every topic, linking to the page where it starts
    let contents = "";
    if (S.group !== "none") {
      const seen = new Map();
      all.forEach((x, i) => { if (!seen.has(x.t)) seen.set(x.t, { i, n: 0 }); seen.get(x.t).n++; });
      for (const [t, v] of seen) contents += `<li><a href="#topic-${t}" data-topic="${t}" data-tpage="${Math.floor(v.i / perPage())}">${esc(S.topic[t].name)}</a> <span class="n">(${v.n})</span></li>`;
    }
    let html = pagerHtml(all.length, pages), lastT = null, lastG = null;
    slice.forEach((x, k) => {
      if (x.t !== lastT && x.t !== "_") {
        const tp = S.topic[x.t];
        const cont = all[start + k - 1] && all[start + k - 1].t === x.t;
        html += `<h2 class="topic-h" id="topic-${x.t}">${esc(tp.name)}${cont ? ' <span class="soft" style="font-size:14px;font-family:var(--sans);font-weight:400">(continued)</span>' : ""}${S.syl.years.length > 1 ? ` <span style="font-size:14px;font-family:var(--sans);color:var(--muted);font-weight:400">Year ${tp.year}</span>` : ""}</h2>`;
        lastG = null;
      }
      if (x.g !== lastG) {
        if (S.group === "subtopic") {
          const sb = S.sub[x.g];
          if (!(sb.name === S.topic[x.t].name && S.topic[x.t].subtopics.length === 1)) html += `<h3 class="sub-h">${esc(sb.name)}${sb.inquiry ? `<span class="iq">Inquiry question: ${esc(sb.inquiry)}</span>` : ""}</h3>`;
        } else if (S.group === "dotpoint") {
          html += `<h3 class="sub-h"><span class="dpid">${x.g}</span>${md(S.dp[x.g].text, true)}</h3>`;
        }
      }
      lastT = x.t; lastG = x.g;
      CTX[x.q.id] = { t: x.t, dp: S.group === "dotpoint" ? x.g : (x.q.dotpoints.find((d) => S.dp[d]) || x.q.dotpoints[0]) };
      html += qHtml(x.q, start + k + 1);
    });
    html += pagerHtml(all.length, pages);
    docEl.innerHTML = html;
    ctxKey = null; ctxSoon();
    contentsEl.innerHTML = S.group === "none" ? "" : `<h2>Contents</h2><ul>${contents}</ul>`;
  }
  /* ---------------- sticky header: current topic + dot point ---------------- */
  const CTX = {};
  let ctxKey = null, ctxQueued = false;
  function ctxSoon() { if (!ctxQueued) { ctxQueued = true; requestAnimationFrame(() => { ctxQueued = false; updateCtx(); }); } }
  function updateCtx() {
    const bar = document.getElementById("ctx-bar");
    if (!bar) return;
    const tb = document.querySelector(".topbar");
    const top = tb && getComputedStyle(tb).position === "sticky" ? tb.getBoundingClientRect().bottom : 0;
    document.getElementById("ctx-wrap").style.top = Math.max(0, top) + "px";
    const line = Math.max(0, top) + 48;
    const arts = document.querySelectorAll("#questions article.q");
    // last question whose top has scrolled up to the bar
    let lo = 0, hi = arts.length - 1, cur = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (arts[m].getBoundingClientRect().top <= line) { cur = arts[m]; lo = m + 1; } else hi = m - 1; }
    const c = cur && CTX[cur.id];
    const key = c ? c.t + "|" + c.dp : null;
    if (key === ctxKey) return;
    ctxKey = key;
    if (!key) { bar.hidden = true; return; }
    const tp = S.topic[c.t], d = S.dp[c.dp];
    bar.innerHTML = `<span class="ctx-topic">${esc(tp ? tp.name : "")}</span>${d ? `<span class="ctx-dp"><b>${esc(c.dp)}</b> ${md(d.text, true)}</span>` : ""}`;
    bar.hidden = false;
  }

  function goPage(p, anchor) {
    S.page = p; render();
    const el = anchor && document.getElementById(anchor);
    (el || document.getElementById("questions")).scrollIntoView({ block: "start" });
  }

  function refresh(tree) { S.page = 0; if (tree) buildTree(); else syncGroupBoxes(); render(); updateBasket(); }

  /* ---------------- basket / PDF ---------------- */
  function updateBasket() {
    document.getElementById("basket-n").textContent = S.basket.size;
    store.set("basket:" + COURSE, [...S.basket]);
    const qs = S.data.questions.filter((q) => S.basket.has(q.id));
    const order = [...S.basket];
    qs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    document.getElementById("basket-list").innerHTML = qs.length
      ? qs.map((q) => `<li>${q.mine ? "Your question" : esc(q._paper.label) + " " + esc(q.ref)} · ${q.marks}m · ${DIFF[q.difficulty]}<button class="linkish" data-unpick="${q.id}">remove</button></li>`).join("")
      : `<li style="list-style:none;margin-left:-22px;color:var(--muted)">Tick “Add to PDF” on any question, or use “Add all shown”.</li>`;
    document.getElementById("basket-marks").textContent = qs.length ? `${qs.length} questions · ${qs.reduce((a, q) => a + q.marks, 0)} marks` : "";
  }
  function buildPdf() {
    const order = [...S.basket];
    let qs = S.data.questions.filter((q) => S.basket.has(q.id));
    const how = document.getElementById("pdf-order").value;
    if (how === "added") qs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    else if (how === "syllabus") qs.sort((a, b) => a._order - b._order);
    else qs.sort((a, b) => a.difficulty - b.difficulty || a._order - b._order);
    if (!qs.length) { alertBox("Add some questions first."); return; }
    const title = document.getElementById("pdf-title").value || `${COURSE_NAME} — Practice Questions`;
    const ansMode = document.getElementById("pdf-answers").value;
    const space = document.getElementById("pdf-space").value;
    const showSrc = document.getElementById("pdf-src").checked;
    const total = qs.reduce((a, q) => a + q.marks, 0);
    let h = `<h1>${esc(title)}</h1><div class="p-sub">${esc(COURSE_NAME)} · ${qs.length} questions · ${total} marks</div>`;
    qs.forEach((q, i) => {
      const opts = q.kind === "mc" ? `<div class="opts ${q.options.every((o) => o.includes("![") || o.length < 38) ? "short" : ""}">${q.options.map((o, k) => `<div><b>(${"ABCD"[k]})</b><span>${md(o, true)}</span></div>`).join("")}</div>` : "";
      const imgs = (q.images || []).map((s) => `<img src="${esc(s)}">`).join("");
      const ans = `<div class="ans"><div class="ans-label">${ansLabelOf(q)}${q.kind === "mc" && q.correct ? " — " + q.correct : ""}</div><div class="ans-body">${md(q.answer)}${(q.answer_images || []).map((s) => `<img src="${esc(s)}">`).join("")}</div></div>`;
      h += `<div class="pq"><div class="pq-head">Question ${i + 1} <span>(${q.marks} mark${q.marks === 1 ? "" : "s"})</span></div><div class="q-body">${md(q.question)}${imgs}</div>${opts}`
        + (showSrc ? `<div class="src">Source: ${q.mine ? "Your question" : q.source ? esc(q.source) : esc(q._paper.label) + ", " + esc(q.ref)}</div>` : "")
        + (space !== "none" && q.kind === "written" && ansMode !== "inline" ? `<div class="work ${space}"></div>` : "")
        + (ansMode === "inline" ? ans : "") + `</div>`;
    });
    if (ansMode === "end") {
      h += `<div class="key"><h2>Answers</h2>` + qs.map((q, i) => `<div class="pq"><div class="pq-head">Question ${i + 1}</div><div class="ans-body">${q.kind === "mc" && q.correct ? `<p><b>${q.correct}</b></p>` : ""}${q.kind === "mc" && q.answer.replace(/\*/g, "").trim() === q.correct ? "" : md(q.answer)}${(q.answer_images || []).map((s) => `<img src="${esc(s)}">`).join("")}</div></div>`).join("") + `</div>`;
    }
    const root = document.getElementById("print-root");
    root.innerHTML = h;
    document.body.classList.add("printing");
    const prevTitle = document.title; document.title = title;
    const imgs = [...root.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    Promise.all(imgs).then(() => setTimeout(() => {
      window.print();
      setTimeout(() => { document.body.classList.remove("printing"); root.innerHTML = ""; document.title = prevTitle; }, 500);
    }, 150));
  }
  function alertBox(msg) { const el = document.getElementById("toast"); el.textContent = msg; el.style.display = "block"; setTimeout(() => (el.style.display = "none"), 2500); }

  function rerenderQ(id) {
    const q = S.data.questions.find((x) => x.id === id), el = document.getElementById(id);
    const num = el.querySelector(".q-title").firstChild.textContent.replace(/\D/g, "");
    el.outerHTML = qHtml(q, +num);
  }

  /* ---------------- done / flag / admin ---------------- */
  async function toggleDone(id) {
    if (!A.user) { alertBox("Sign in to tick off questions you've done."); A.signIn && A.signIn(); return; }
    const on = !isDone(id);
    try { await A.setDone(id, on); } catch (e) { alertBox("Couldn't save — " + e.message); return; }
    if (S.show !== "all") render(); else rerenderQ(id);
    updateProgress();
  }
  async function toggleSaved(id) {
    if (!A.user) { alertBox("Sign in to save questions to your question bank."); A.signIn && A.signIn(); return; }
    const on = !isSaved(id);
    try { await A.setSaved(id, COURSE, on); } catch (e) { alertBox("Couldn't save — " + e.message); return; }
    rerenderQ(id);
    alertBox(on ? "Saved — see it under ★ Saved at the top." : "Removed from your saved questions.");
  }
  function updateProgress() {
    const box = document.getElementById("progress-panel");
    if (!box) return;
    box.hidden = !A.enabled;
    const cnt = document.getElementById("done-count");
    const sw = document.getElementById("show-wrap"); if (sw) sw.hidden = !A.user;
    if (!A.user) { cnt.innerHTML = `<button class="linkish" id="progress-signin">Sign in</button> to tick off questions you've done and save questions to your own bank.`; return; }
    const n = S.data.questions.filter((q) => isDone(q.id)).length;
    cnt.textContent = `${n} of ${S.data.questions.length} questions done`;
  }
  function openFlag(id) {
    if (!A.user) { alertBox("Sign in to report a problem."); A.signIn && A.signIn(); return; }
    const q = S.data.questions.find((x) => x.id === id);
    let m = document.getElementById("flag-modal");
    if (!m) {
      m = document.createElement("div"); m.id = "flag-modal"; m.className = "modal";
      m.innerHTML = `<div class="modal-card" role="dialog" aria-labelledby="flag-h"><h3 id="flag-h">⚠ Report a problem</h3><p class="soft" id="flag-q"></p>
        <label class="lab" for="flag-reason">What's wrong?</label>
        <select id="flag-reason"><option>Wrong answer or solution</option><option>Typo, or maths not displaying</option><option>Missing or wrong diagram</option><option>Wrong dot point or topic</option><option>Wrong difficulty</option><option>Duplicate question</option><option>Spam or inappropriate</option><option>Other</option></select>
        <label class="lab" for="flag-note">Details <span class="soft">(optional)</span></label><textarea id="flag-note" rows="3" maxlength="1000" placeholder="e.g. the answer should be 3/4, not 4/3"></textarea>
        <div class="row" style="margin-top:12px"><span style="flex:1"></span><button class="btn" data-fclose>Cancel</button><button class="btn primary" id="flag-send">Send</button></div></div>`;
      document.body.appendChild(m);
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-fclose]")) m.hidden = true; });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") m.hidden = true; });
    }
    m.querySelector("#flag-q").textContent = (q.source ? q.source : q._paper.label + ", " + q.ref);
    m.querySelector("#flag-note").value = "";
    m.querySelector("#flag-send").onclick = async () => {
      try { await A.flag({ id: q.id, course: COURSE, label: q.source ? q.source : q._paper.label + ", " + q.ref }, m.querySelector("#flag-reason").value, m.querySelector("#flag-note").value); }
      catch (e) { alertBox("Couldn't send — " + e.message); return; }
      m.hidden = true; rerenderQ(q.id); alertBox("Thanks — sent to the site admin to review.");
    };
    m.hidden = false; m.querySelector("#flag-reason").focus();
  }
  async function deleteQ(id) {
    const q = S.data.questions.find((x) => x.id === id);
    if (!q || !confirm(`Delete this question from the site?\n\n${q.source || q._paper.label + ", " + q.ref}`)) return;
    try { if (q.live) await A.deleteSubmission(q.fsid); else await A.deleteQuestion(q.id, COURSE); }
    catch (e) { alertBox("Couldn't delete — " + e.message); return; }
    S.data.questions = S.data.questions.filter((x) => x.id !== id);
    render(); updateBasket(); alertBox(A.isAdmin && !q.live ? "Deleted. Undo it from the Admin page (Edited questions)." : "Deleted.");
  }

  /* ---------------- events ---------------- */
  function bind() {
    const $ = (id) => document.getElementById(id);
    $("search").addEventListener("input", (e) => { S.search = e.target.value.trim().toLowerCase(); clearTimeout(bind.t); bind.t = setTimeout(() => refresh(true), 200); });
    document.querySelectorAll("[data-diff]").forEach((b) => b.addEventListener("click", () => {
      const d = +b.dataset.diff; S.diff.has(d) ? S.diff.delete(d) : S.diff.add(d); b.classList.toggle("on", S.diff.has(d)); refresh(true);
    }));
    document.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.kind; S.kinds.has(k) ? S.kinds.delete(k) : S.kinds.add(k); b.classList.toggle("on", S.kinds.has(k)); refresh(true);
    }));
    $("sort").addEventListener("change", (e) => { S.sort = e.target.value; refresh(); });
    $("group").addEventListener("change", (e) => { S.group = e.target.value; refresh(); });
    $("answers").checked = S.showAnswers;
    $("answers").addEventListener("change", (e) => { S.showAnswers = e.target.checked; store.set("showAnswers", S.showAnswers); refresh(); });
    $("hide-empty").addEventListener("change", (e) => { S.hideEmpty = e.target.checked; buildTree(); });
    $("clear-topics").addEventListener("click", () => { S.sel.clear(); refresh(true); });
    $("reset").addEventListener("click", () => {
      S.sel.clear(); S.papers.clear(); S.diff = new Set([1, 2, 3, 4, 5]); S.kinds = new Set(["mc", "written"]); S.search = ""; $("search").value = "";
      document.querySelectorAll("[data-diff],[data-kind]").forEach((b) => b.classList.add("on")); buildPapers(); refresh(true);
    });
    $("tree").addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.dp) { t.checked ? S.sel.add(t.dataset.dp) : S.sel.delete(t.dataset.dp); refresh(false); }
      else if (t.dataset.group) { for (const id of dpsUnder(t.dataset.group)) t.checked ? S.sel.add(id) : S.sel.delete(id); refresh(true); }
    });
    $("tree").addEventListener("click", (e) => { if (e.target.matches("summary input")) e.stopPropagation(); }, true);
    $("papers").addEventListener("change", (e) => { const id = e.target.dataset.paper; if (!id) return; e.target.checked ? S.papers.add(id) : S.papers.delete(id); refresh(true); });
    $("questions").addEventListener("click", (e) => {
      const pv = e.target.closest("[data-prev]");
      if (pv) { const id = pv.dataset.prev; S.prevOpen.has(id) ? S.prevOpen.delete(id) : S.prevOpen.add(id); rerenderQ(id); return; }
      const a = e.target.closest("[data-ans]");
      if (a) { const id = a.dataset.ans; S.opened.has(id) ? S.opened.delete(id) : S.opened.add(id); rerenderQ(id); return; }
      const dn = e.target.closest("[data-done]");
      if (dn) { toggleDone(dn.dataset.done); return; }
      const sv = e.target.closest("[data-save]");
      if (sv) { toggleSaved(sv.dataset.save); return; }
      const fl = e.target.closest("[data-flag]");
      if (fl) { openFlag(fl.dataset.flag); return; }
      const del = e.target.closest("[data-qdel]");
      if (del) { deleteQ(del.dataset.qdel); return; }
    });
    $("questions").addEventListener("change", (e) => { const id = e.target.dataset.pick; if (!id) return; e.target.checked ? S.basket.add(id) : S.basket.delete(id); updateBasket(); });
    $("add-all").addEventListener("click", () => { const l = sorted(S.data.questions.filter(passes)); l.forEach((q) => S.basket.add(q.id)); render(); updateBasket(); alertBox(`Added ${l.length} questions to the PDF.`); });
    const drawer = $("drawer"), scrim = $("scrim"), side = $("sidebar");
    const close = () => { drawer.classList.remove("show"); side.classList.remove("show"); scrim.classList.remove("show"); };
    $("basket-open").addEventListener("click", () => { drawer.classList.add("show"); scrim.classList.add("show"); });
    $("filters-open").addEventListener("click", () => { side.classList.add("show"); scrim.classList.add("show"); });
    scrim.addEventListener("click", close); $("drawer-close").addEventListener("click", close);
    $("basket-list").addEventListener("click", (e) => { const id = e.target.dataset.unpick; if (id) { S.basket.delete(id); render(); updateBasket(); } });
    $("basket-clear").addEventListener("click", () => { S.basket.clear(); render(); updateBasket(); });
    $("make-pdf").addEventListener("click", () => { close(); buildPdf(); });
    const pp0 = $("per-page");
    if (pp0) { pp0.value = String(S.perPage); pp0.addEventListener("change", (e) => { S.perPage = +e.target.value; store.set("perPage", S.perPage); refresh(); }); }
    $("questions").addEventListener("click", (e) => { const b = e.target.closest("[data-page]"); if (b && !b.disabled) goPage(+b.dataset.page); });
    $("contents").addEventListener("click", (e) => {
      const a = e.target.closest("[data-tpage]"); if (!a) return;
      e.preventDefault(); goPage(+a.dataset.tpage, "topic-" + a.dataset.topic);
    });
    const sd = $("show-done");
    if (sd) {
      const mark = () => sd.querySelectorAll("[data-show]").forEach((b) => b.classList.toggle("on", b.dataset.show === S.show));
      mark();
      sd.addEventListener("click", (e) => { const b = e.target.closest("[data-show]"); if (!b) return; S.show = b.dataset.show; store.set("showDone", S.show); mark(); refresh(true); });
    }
    window.addEventListener("scroll", ctxSoon, { passive: true });
    window.addEventListener("resize", ctxSoon);
    const pp = $("progress-panel");
    if (pp) pp.addEventListener("click", (e) => { if (e.target.id === "progress-signin") A.signIn && A.signIn(); });
    // signing in/out after the page has loaded
    document.addEventListener("hscauth", () => { updateProgress(); render(); });
  }

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", async () => {
    try { await load(); } catch (e) { document.getElementById("questions").innerHTML = `<div class="none">Could not load questions (${esc(e.message)}).</div>`; return; }
    document.getElementById("generated").textContent = S.data.generated ? `Last updated ${S.data.generated}.` : "";
    const ps = Object.values(S.data.papers);
    document.getElementById("sources").textContent = ps.length
      ? `${S.data.questions.length} questions from ${ps.length} paper${ps.length === 1 ? "" : "s"}, tagged to the ${S.syl.syllabus} ${COURSE_NAME} syllabus. Content outside that syllabus has been removed.`
      : "No papers indexed yet — new trial papers are added daily.";
    buildPapers(); buildTree(); bind(); render(); updateBasket(); updateProgress();
    const h = decodeURIComponent(location.hash.slice(1));
    if (h && !document.getElementById(h)) { const p = pageOf(h); if (p > 0) { S.page = p; render(); } }
    if (h && document.getElementById(h)) setTimeout(() => document.getElementById(h).scrollIntoView({ block: "start" }), 50);
  });
})();
