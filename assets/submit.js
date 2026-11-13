/* Better HSC Papers — submit-a-question page.  Questions are kept in this browser (hscq:mine) and can be sent for review as a GitHub issue. */
(function () {
  "use strict";
  const { esc, md } = window.HSCRender;
  const REPO = "Planeman653/betterhscpapers";
  const COURSES = { advanced: "Advanced", extension1: "Extension 1", extension2: "Extension 2", physics: "Physics", chemistry: "Chemistry" };
  const SCIENCE = (c) => c === "physics" || c === "chemistry";
  const DIFF = ["", "Easy", "Moderate", "Medium", "Hard", "Very hard"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("hscq:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("hscq:" + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const $ = (id) => document.getElementById(id);
  const sylCache = {};
  let DP = {};          // dot point id -> {id, text, topic, sub}
  let DP_LIST = [];

  const blank = (course) => ({
    id: null, course, kind: "written", question: "", options: ["", "", "", ""], correct: "", answer: "", answer_type: SCIENCE(course) ? "sample" : "worked",
    images: [], answer_images: [], marks: 2, difficulty: 3, dotpoints: [],
    src: { type: "own", school: "", year: "", ref: "", text: "" }, credit: store.get("credit", ""), prev: [],
  });
  let Q = store.get("draft", null) || blank(new URLSearchParams(location.search).get("course") || store.get("lastCourse", "extension1"));
  if (!COURSES[Q.course]) Q.course = "extension1";

  /* ---------------- helpers ---------------- */
  function toast(msg, ms) {
    const t = $("toast"); t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.style.display = "none"), ms || 2600);
  }
  function sourceText(s) {
    const yr = s.year ? " " + s.year : "";
    const ref = s.ref ? ", " + s.ref : "";
    if (s.type === "trial") return s.school ? `${s.school}${yr} Trial${ref}` : "";
    if (s.type === "hsc") return `HSC${yr}${ref}`;
    if (s.type === "textbook" || s.type === "other") return s.text || "";
    return "";
  }
  // Only the public fields: what is stored for the course page and sent for review.
  function record() {
    const r = {
      id: Q.id, course: Q.course, kind: Q.kind, marks: +Q.marks || 1, difficulty: +Q.difficulty, dotpoints: Q.dotpoints.slice(),
      question: Q.question.trim(), answer: Q.answer.trim(), answer_type: Q.answer_type, images: Q.images, answer_images: Q.answer_images,
    };
    if (Q.kind === "mc") { r.options = Q.options.map((o) => o.trim()); r.correct = Q.correct; }
    const s = sourceText(Q.src); if (s) r.source = s;
    if (Q.src.ref) r.ref = Q.src.ref;
    if (Q.credit.trim()) r.credit = Q.credit.trim();
    const prev = Q.prev.filter((p) => p.question.trim()).map((p) => ({ ref: p.ref.trim() || "Earlier part", kind: "written", marks: +p.marks || 1, question: p.question.trim(), answer: p.answer.trim(), images: p.images || [] }));
    if (prev.length) r.prev = prev;
    r.src = { ...Q.src };
    return r;
  }

  /* ---------------- validation ---------------- */
  function texProblems(label, text) {
    const out = [];
    if (!text) return out;
    const dollars = (text.replace(/\\\$/g, "").match(/\$/g) || []).length;
    if (dollars % 2) out.push(`${label}: unmatched $ — every piece of maths needs an opening and closing $.`);
    else if (/katex-error/.test(md(text))) out.push(`${label}: some LaTeX doesn't render — check the red text in the preview.`);
    return out;
  }
  function problems() {
    const p = [];
    if (!Q.question.trim()) p.push("Write the question.");
    if (Q.kind === "mc") {
      if (Q.options.some((o) => !o.trim())) p.push("Fill in all four options.");
      if (!Q.correct) p.push("Tick the correct option.");
    }
    if (!Q.answer.trim() && !(Q.kind === "mc" && Q.correct)) p.push("Write the answer.");
    if (!Q.dotpoints.length) p.push("Pick at least one dot point.");
    if (!(Q.marks >= 1 && Q.marks <= 20)) p.push("Marks must be between 1 and 20.");
    if (Q.src.type === "trial" && !Q.src.school.trim()) p.push("Add the school for the trial paper.");
    p.push(...texProblems("Question", Q.question), ...texProblems("Answer", Q.answer));
    Q.options.forEach((o, i) => Q.kind === "mc" && p.push(...texProblems("Option " + "ABCD"[i], o)));
    Q.prev.forEach((x, i) => {
      const n = x.ref.trim() || "Earlier part " + (i + 1);
      if (!x.question.trim()) p.push(`${n}: write the question or remove the part.`);
      p.push(...texProblems(n, x.question), ...texProblems(n + " answer", x.answer));
    });
    return p;
  }

  /* ---------------- preview (same markup as the course pages) ---------------- */
  function preview() {
    const r = record();
    if (!r.question && !r.answer) { $("preview").innerHTML = `<div class="none">Start typing to see your question.</div>`; return; }
    const sci = SCIENCE(r.course);
    const imgs = (r.images || []).map((s) => `<img src="${esc(s)}" alt="Diagram">`).join("");
    const opts = r.kind === "mc" ? (() => {
      const short = r.options.every((o) => o.includes("![") || o.replace(/\$[^$]*\$/g, "xxxx").length < 38);
      return `<div class="opts ${short ? "short" : ""}">${r.options.map((o, i) => `<div class="${r.correct === "ABCD"[i] ? "correct" : ""}"><b>(${"ABCD"[i]})</b><span>${md(o, true)}</span></div>`).join("")}</div>`;
    })() : "";
    const label = r.answer_type === "short" ? "Answer" : r.answer_type === "sample" ? "Sample answer" : "Worked solution";
    const ansImgs = (r.answer_images || []).map((s) => `<img src="${esc(s)}" alt="Solution diagram">`).join("");
    const prev = (r.prev || []).map((x) => `<div class="prev-part"><div class="prev-ref">${esc(x.ref)} <span class="marks">(${x.marks} mark${x.marks === 1 ? "" : "s"})</span></div><div class="q-body">${md(x.question)}${(x.images || []).map((s) => `<img src="${esc(s)}" alt="">`).join("")}</div>${x.answer ? `<details class="prev-ans" open><summary>Show ${sci ? "sample answer" : "solution"}</summary><div class="ans"><div class="ans-body">${md(x.answer)}</div></div></details>` : ""}</div>`).join("");
    const dps = r.dotpoints.length ? r.dotpoints.join(", ") : "none yet";
    $("preview").innerHTML = `<article class="q">
      <div class="q-head"><span class="q-title">Question 1 <span class="marks">(${r.marks} mark${r.marks === 1 ? "" : "s"})</span></span>
        <span class="diff d${r.difficulty}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= r.difficulty ? "f" : ""}"></i>`).join("")}&nbsp;${DIFF[r.difficulty]}</span>
        <span class="grow"></span>${prev ? `<span class="q-actions"><span class="prev-btn on">Previous parts (${r.prev.length})</span></span>` : ""}</div>
      ${prev ? `<div class="prev-parts"><div class="prev-label">Earlier parts of this question</div>${prev}</div>` : ""}
      <div class="q-body">${md(r.question) || '<p class="soft">(question)</p>'}${imgs}</div>${opts}
      <div class="src"><span class="tag">Yours</span> Source: ${r.source ? esc(r.source) : "Your question"}${r.credit ? " · submitted by " + esc(r.credit) : ""}${r.kind === "mc" ? " (multiple choice)" : ""} · <span class="dps">Dot point${r.dotpoints.length > 1 ? "s" : ""} ${esc(dps)}</span></div>
      <div class="ans"><div class="ans-label">${label}${r.kind === "mc" && r.correct ? " — " + r.correct : ""}</div><div class="ans-body">${md(r.answer)}${ansImgs}</div></div>
    </article>`;
    const pr = problems();
    $("problems").innerHTML = pr.map((x) => `<li>${esc(x)}</li>`).join("");
  }

  /* ---------------- syllabus picker ---------------- */
  async function loadSyllabus(course) {
    if (!sylCache[course]) sylCache[course] = fetch("data/syllabus/" + course + ".json").then((r) => r.json());
    const syl = await sylCache[course];
    if (course !== Q.course) return;
    DP = {}; DP_LIST = [];
    for (const y of syl.years) for (const t of y.topics) for (const s of t.subtopics) for (const p of s.dotpoints) {
      const d = { id: p.id, text: p.text, topic: t.name, sub: s.name };
      d._s = (p.id + " " + p.text + " " + t.name + " " + s.name).toLowerCase();
      DP[p.id] = d; DP_LIST.push(d);
    }
    Q.dotpoints = Q.dotpoints.filter((d) => DP[d]);
    renderDp(); preview();
  }
  function renderDp() {
    $("dp-chosen").innerHTML = Q.dotpoints.length ? Q.dotpoints.map((id, i) => `<div class="dp-pick"><span class="id">${esc(id)}</span><span class="txt">${md(DP[id] ? DP[id].text : "", true)}</span>${i === 0 ? `<span class="tag">Listed here</span>` : `<button type="button" class="linkish" data-primary="${esc(id)}">Make main</button>`}<button type="button" class="x" data-unpick="${esc(id)}" aria-label="Remove">×</button></div>`).join("") : `<div class="soft" style="font-size:13.5px">No dot points picked yet.</div>`;
    const words = $("dp-search").value.toLowerCase().split(/\s+/).filter(Boolean);
    let list = DP_LIST.filter((d) => words.every((w) => d._s.includes(w)));
    const total = list.length; list = list.slice(0, 80);
    let lastSub = "";
    $("dp-list").innerHTML = list.length ? list.map((d) => {
      const h = d.sub !== lastSub ? `<div class="dp-sub">${esc(d.topic)} — ${esc(d.sub)}</div>` : ""; lastSub = d.sub;
      return h + `<button type="button" class="dp-opt${Q.dotpoints.includes(d.id) ? " on" : ""}" data-dp="${esc(d.id)}"><span class="id">${esc(d.id)}</span><span>${md(d.text, true)}</span></button>`;
    }).join("") + (total > list.length ? `<div class="soft" style="padding:6px;font-size:13px">${total - list.length} more — keep typing to narrow down.</div>` : "") : `<div class="none" style="padding:16px">No dot points match.</div>`;
  }

  /* ---------------- images ---------------- */
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1100 / img.width);
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const png = c.toDataURL("image/png"), jpg = c.toDataURL("image/jpeg", 0.85);
        res(png.length < jpg.length * 1.3 ? png : jpg);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(); };
      img.src = url;
    });
  }
  function renderImgs() {
    document.querySelectorAll("[data-imgs]").forEach((box) => {
      const key = box.dataset.imgs;
      const arr = key.startsWith("prev:") ? Q.prev[+key.slice(5)].images : Q[key];
      box.innerHTML = (arr || []).map((s, i) => `<div class="thumb"><img src="${esc(s)}" alt=""><button type="button" class="x" data-rmimg="${key}" data-i="${i}" aria-label="Remove image">×</button></div>`).join("");
    });
  }

  /* ---------------- previous parts ---------------- */
  function renderPrev() {
    $("prev-list").innerHTML = Q.prev.map((x, i) => `<div class="prev-edit" data-pi="${i}">
      <div class="field-row"><div class="field"><label class="lab">Part</label><input type="text" data-pf="ref" value="${esc(x.ref)}" placeholder="e.g. (c)(i)"></div>
        <div class="field"><label class="lab">Marks</label><input type="number" min="1" max="20" data-pf="marks" value="${esc(x.marks)}"></div>
        <span style="flex:1"></span><button type="button" class="linkish" data-rmprev="${i}">Remove part</button></div>
      <label class="lab">Question</label><textarea rows="3" data-pf="question">${esc(x.question)}</textarea>
      <div class="imgs" data-imgs="prev:${i}"></div>
      <label class="up"><input type="file" accept="image/*" multiple data-upload="prev:${i}"> Add a diagram</label>
      <label class="lab">Answer <span class="soft">(optional)</span></label><textarea rows="3" data-pf="answer">${esc(x.answer)}</textarea>
    </div>`).join("");
    renderImgs();
  }

  /* ---------------- form <-> state ---------------- */
  function fill() {
    $("course").innerHTML = Object.entries(COURSES).map(([k, v]) => `<button type="button" class="chip${Q.course === k ? " on" : ""}" data-course="${k}">${v}</button>`).join("");
    document.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b.dataset.kind === Q.kind));
    document.querySelectorAll("[data-at]").forEach((b) => b.classList.toggle("on", b.dataset.at === Q.answer_type));
    document.querySelectorAll("[data-d]").forEach((b) => b.classList.toggle("on", +b.dataset.d === +Q.difficulty));
    $("mc-box").hidden = Q.kind !== "mc";
    $("question").value = Q.question; $("answer").value = Q.answer; $("marks").value = Q.marks;
    document.querySelectorAll("[data-opt]").forEach((el) => (el.value = Q.options[+el.dataset.opt] || ""));
    document.querySelectorAll("input[name=correct]").forEach((el) => (el.checked = el.value === Q.correct));
    $("src-type").value = Q.src.type; $("src-school").value = Q.src.school; $("src-year").value = Q.src.year; $("src-ref").value = Q.src.ref; $("src-text").value = Q.src.text;
    $("credit").value = Q.credit;
    srcFields();
    $("form-title").textContent = Q.id ? "Edit your question" : "Submit a question";
    renderPrev(); renderImgs(); renderMine();
  }
  function srcFields() {
    const t = Q.src.type;
    document.querySelectorAll("[data-src]").forEach((el) => {
      const want = el.dataset.src.split(" ");
      el.hidden = !((t === "trial" && want.includes("paper")) || (t === "hsc" && want.includes("hsc")) || ((t === "textbook" || t === "other") && want.includes("text")));
    });
  }
  let saveT;
  function changed() {
    clearTimeout(saveT); saveT = setTimeout(() => store.set("draft", Q), 300);
    preview();
  }

  /* ---------------- saved questions ---------------- */
  function mine() { return store.get("mine", []); }
  function renderMine() {
    const m = mine();
    $("mine-box").hidden = !m.length;
    $("mine").innerHTML = m.slice().reverse().map((x) => {
      const t = x.question.replace(/\$[^$]*\$/g, "…").replace(/[#*_>`]/g, "").replace(/\s+/g, " ").slice(0, 110);
      return `<div class="mine-row"><div class="mine-main"><b>${esc(COURSES[x.course] || x.course)}</b> · ${esc(x.dotpoints[0] || "")} · ${x.marks} mark${x.marks === 1 ? "" : "s"}${x.sent ? ' · <span class="soft">published</span>' : ""}<div class="soft">${esc(t)}${x.question.length > 110 ? "…" : ""}</div></div>
        <a class="btn" href="${x.course}.html#${encodeURIComponent(x.id)}">View</a><button type="button" class="btn" data-edit="${esc(x.id)}">Edit</button><button type="button" class="btn" data-del="${esc(x.id)}">Delete</button></div>`;
    }).join("");
  }
  function save(extra) {
    const pr = problems();
    if (pr.length) { preview(); $("problems").scrollIntoView({ behavior: "smooth", block: "center" }); toast("Fix the items listed first"); return null; }
    const r = record();
    const now = new Date().toISOString();
    if (!r.id) r.id = "mine-" + Date.now().toString(36);
    const list = mine();
    const i = list.findIndex((x) => x.id === r.id);
    const rec = { ...(i >= 0 ? list[i] : { created: now }), ...r, updated: now, ...(extra || {}) };
    if (i >= 0) list[i] = rec; else list.push(rec);
    if (!store.set("mine", list)) { toast("Not enough browser storage — try smaller or fewer images", 4500); return null; }
    store.set("credit", Q.credit); store.set("lastCourse", Q.course);
    Q.id = rec.id; store.set("draft", Q);
    fill(); preview();
    return rec;
  }

  /* ---------------- send for review (GitHub issue) ---------------- */
  function issueBody(rec) {
    const clean = { ...rec };
    clean.client_id = rec.id;
    for (const k of ["id", "created", "updated", "sent", "src"]) delete clean[k];
    const nImg = (clean.images || []).length + (clean.answer_images || []).length + (clean.prev || []).reduce((a, p) => a + (p.images || []).length, 0);
    if (nImg) clean.diagrams = { question: (clean.images || []).length, answer: (clean.answer_images || []).length, prev: (clean.prev || []).map((p) => (p.images || []).length) };
    delete clean.images; delete clean.answer_images;
    if (clean.prev) clean.prev = clean.prev.map(({ images, ...p }) => p);
    const head = `New question for **${COURSES[rec.course]}**, dot point ${rec.dotpoints.join(", ")}. It is published automatically when you press **Create**.\n\n` +
      (nImg ? `**This question has ${nImg} diagram${nImg === 1 ? "" : "s"}** — drag ${nImg === 1 ? "it" : "them"} into this box before submitting (question diagrams first, then answer diagrams).\n\n` : "") +
      "<!-- Please don't edit the block below. -->\n";
    return head + "```json\n" + JSON.stringify(clean, null, 2) + "\n```\n";
  }
  async function send() {
    const rec = save({ sent: new Date().toISOString() });
    if (!rec) return;
    const title = `[Submission] ${COURSES[rec.course]} ${rec.dotpoints[0]} — ${rec.question.replace(/\$[^$]*\$/g, "…").replace(/\s+/g, " ").slice(0, 60)}`;
    const body = issueBody(rec);
    const base = `https://github.com/${REPO}/issues/new?labels=submission&title=${encodeURIComponent(title)}`;
    let url = base + "&body=" + encodeURIComponent(body);
    let copied = false;
    if (url.length > 7500) {
      try { await navigator.clipboard.writeText(body); copied = true; } catch (e) {}
      url = base + "&body=" + encodeURIComponent(copied ? "<!-- Paste your question here (it has been copied to your clipboard). -->\n\n" : "<!-- Use 'Download as file' on the submit page and drag the file in here. -->\n\n");
    }
    window.open(url, "_blank", "noopener");
    toast(copied ? "Your question is copied — paste it into the GitHub form and press Create" : "Press Create on GitHub — it goes live within a couple of minutes", 6000);
  }
  function download() {
    const pr = problems();
    if (pr.length) { preview(); toast("Fix the items listed first"); return; }
    const r = record(); delete r.src;
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `question-${r.course}-${(r.dotpoints[0] || "x").replace(/\./g, "-")}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------------- events ---------------- */
  function bind() {
    const form = $("form");
    form.addEventListener("click", async (e) => {
      const t = e.target.closest("button,[data-dp]"); if (!t) return;
      const d = t.dataset;
      if (d.course && d.course !== Q.course) { Q.course = d.course; if (!Q.id) Q.answer_type = SCIENCE(Q.course) ? "sample" : "worked"; fill(); loadSyllabus(Q.course); changed(); return; }
      if (d.kind) { Q.kind = d.kind; fill(); changed(); return; }
      if (d.at) { Q.answer_type = d.at; fill(); changed(); return; }
      if (d.d) { Q.difficulty = +d.d; fill(); changed(); return; }
      if (d.dp) {
        const i = Q.dotpoints.indexOf(d.dp);
        if (i >= 0) Q.dotpoints.splice(i, 1);
        else if (Q.dotpoints.length >= 3) { toast("Up to 3 dot points"); return; }
        else Q.dotpoints.push(d.dp);
        renderDp(); changed(); return;
      }
      if (d.unpick) { Q.dotpoints = Q.dotpoints.filter((x) => x !== d.unpick); renderDp(); changed(); return; }
      if (d.primary) { Q.dotpoints = [d.primary, ...Q.dotpoints.filter((x) => x !== d.primary)]; renderDp(); changed(); return; }
      if (d.rmimg) {
        const arr = d.rmimg.startsWith("prev:") ? Q.prev[+d.rmimg.slice(5)].images : Q[d.rmimg];
        arr.splice(+d.i, 1); renderImgs(); changed(); return;
      }
      if (t.id === "add-prev") { Q.prev.push({ ref: "", marks: 1, question: "", answer: "", images: [] }); renderPrev(); changed(); const ta = $("prev-list").lastElementChild; ta && ta.querySelector("input").focus(); return; }
      if (d.rmprev) { Q.prev.splice(+d.rmprev, 1); renderPrev(); changed(); return; }
      if (t.id === "save") { if (save()) toast(`Saved — it's on the ${COURSES[Q.course]} page in this browser only`); return; }
      if (t.id === "send") { send(); return; }
      if (t.id === "download") { download(); return; }
      if (t.id === "clear") { startNew(); return; }
      if (d.edit) { edit(d.edit); return; }
      if (d.del) {
        if (!confirm("Delete this question from your question bank?")) return;
        store.set("mine", mine().filter((x) => x.id !== d.del));
        if (Q.id === d.del) Q.id = null;
        fill(); preview(); return;
      }
    });
    form.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id === "question") Q.question = t.value;
      else if (t.id === "answer") Q.answer = t.value;
      else if (t.id === "marks") Q.marks = +t.value;
      else if (t.id === "credit") Q.credit = t.value;
      else if (t.id === "src-school") Q.src.school = t.value;
      else if (t.id === "src-year") Q.src.year = t.value;
      else if (t.id === "src-ref") Q.src.ref = t.value;
      else if (t.id === "src-text") Q.src.text = t.value;
      else if (t.id === "dp-search") { renderDp(); return; }
      else if (t.dataset.opt != null) Q.options[+t.dataset.opt] = t.value;
      else if (t.dataset.pf) { const i = +t.closest("[data-pi]").dataset.pi; Q.prev[i][t.dataset.pf] = t.dataset.pf === "marks" ? +t.value : t.value; }
      else return;
      changed();
    });
    form.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.name === "correct") { Q.correct = t.value; changed(); return; }
      if (t.id === "src-type") { Q.src.type = t.value; srcFields(); changed(); return; }
      if (t.dataset.upload) {
        const key = t.dataset.upload;
        const arr = key.startsWith("prev:") ? Q.prev[+key.slice(5)].images : Q[key];
        for (const f of t.files) { try { arr.push(await shrink(f)); } catch (err) { toast("Couldn't read " + f.name); } }
        t.value = ""; renderImgs(); changed();
      }
    });
  }
  function startNew() {
    const c = Q.course, credit = Q.credit;
    Q = blank(c); Q.credit = credit;
    store.set("draft", null); history.replaceState(null, "", "submit.html");
    fill(); renderDp(); preview(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function edit(id) {
    const x = mine().find((m) => m.id === id);
    if (!x) { toast("That question isn't in this browser"); return; }
    Q = { ...blank(x.course), ...x, options: x.options || ["", "", "", ""], correct: x.correct || "",
      src: x.src || { type: x.source ? "other" : "own", school: "", year: "", ref: x.ref || "", text: x.source || "" },
      credit: x.credit || "", prev: (x.prev || []).map((p) => ({ ref: p.ref, marks: p.marks, question: p.question, answer: p.answer || "", images: p.images || [] })) };
    for (const k of ["created", "updated", "sent", "source", "ref"]) delete Q[k];
    history.replaceState(null, "", "submit.html?edit=" + encodeURIComponent(id));
    fill(); loadSyllabus(Q.course); preview(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function init() {
    bind();
    const e = new URLSearchParams(location.search).get("edit");
    if (e) edit(e); else { fill(); loadSyllabus(Q.course); preview(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
