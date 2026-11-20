/* Better HSC Papers — submit-a-question page.  Questions are kept in this browser (hscq:mine) and can be sent for review as a GitHub issue. */
(function () {
  "use strict";
  const { esc, nm, md } = window.HSCRender;
  const A = window.HSCAuth;
  let EDIT = null;      // what is being edited: {kind: "sub"|"queue"|"repo", id, qid, course}
  const COURSES = { standard1: "Standard 1", standard2: "Standard 2", advanced: "Advanced", extension1: "Extension 1", extension2: "Extension 2", physics: "Physics", chemistry: "Chemistry", biology: "Biology" };
  const SCIENCE = (c) => c === "physics" || c === "chemistry" || c === "biology";
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
    src: { type: "own", school: "", year: "", ref: "", text: "" }, credit: store.get("credit", ""), prev: [], mode: "full",
  });
  let Q = store.get("draft", null) || blank(new URLSearchParams(location.search).get("course") || store.get("lastCourse", "extension1"));
  if (!COURSES[Q.course]) Q.course = "extension1";
  if (!Q.mode) Q.mode = "full";

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
    const pic = Q.images.length > 0;   // a photo / screenshot of the question is enough on its own
    if (!Q.question.trim() && !pic) p.push("Type the question, or upload a photo or screenshot of it.");
    const full = Q.mode !== "queue";
    if (Q.kind === "mc") {
      const filled = Q.options.filter((o) => o.trim()).length;
      if (filled < 4 && !(pic && filled === 0)) p.push(pic ? "Fill in all four options, or leave them all blank if they're in your image." : "Fill in all four options.");
      if (!Q.correct && full) p.push("Tick the correct option.");
    }
    if (full && !Q.answer.trim() && !Q.answer_images.length && !(Q.kind === "mc" && Q.correct)) p.push("Write the answer or upload a photo of it (or choose “Just the question” above).");
    if (full && !Q.dotpoints.length) p.push("Pick at least one dot point.");
    if (JSON.stringify(Q).length > 900000) p.push("The diagrams are too large — remove some or use smaller images.");
    if (full && !(Q.marks >= 1 && Q.marks <= 20)) p.push("Marks must be between 1 and 20.");
    if (Q.src.type === "trial" && !Q.src.school.trim()) p.push("Add the school for the trial paper.");
    p.push(...texProblems("Question", Q.question), ...(full ? texProblems("Answer", Q.answer) : []));
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
    if (!r.question && !r.answer && !(r.images || []).length) { $("preview").innerHTML = `<div class="none">Start typing to see your question.</div>`; return; }
    const sci = SCIENCE(r.course);
    const qm = Q.mode === "queue" && !(EDIT && EDIT.kind === "repo");
    const imgs = (r.images || []).map((s) => `<img src="${esc(s)}" alt="Diagram">`).join("");
    const opts = r.kind === "mc" && r.options.some((o) => o.trim()) ? (() => {
      const short = r.options.every((o) => o.includes("![") || o.replace(/\$[^$]*\$/g, "xxxx").length < 38);
      return `<div class="opts ${short ? "short" : ""}">${r.options.map((o, i) => `<div class="${r.correct === "ABCD"[i] ? "correct" : ""}"><b>(${"ABCD"[i]})</b><span>${md(o, true)}</span></div>`).join("")}</div>`;
    })() : "";
    const label = r.answer_type === "short" ? "Answer" : r.answer_type === "sample" ? "Sample answer" : "Worked solution";
    const ansImgs = (r.answer_images || []).map((s) => `<img src="${esc(s)}" alt="Solution diagram">`).join("");
    const prev = (r.prev || []).map((x) => `<div class="prev-part"><div class="prev-ref">${esc(x.ref)}${qm ? "" : ` <span class="marks">(${x.marks} mark${x.marks === 1 ? "" : "s"})</span>`}</div><div class="q-body">${md(x.question)}${(x.images || []).map((s) => `<img src="${esc(s)}" alt="">`).join("")}</div>${x.answer ? `<details class="prev-ans" open><summary>Show ${sci ? "sample answer" : "solution"}</summary><div class="ans"><div class="ans-body">${md(x.answer)}</div></div></details>` : ""}</div>`).join("");
    const dps = qm ? "tagged by us" : r.dotpoints.length ? r.dotpoints.join(", ") : "none yet";
    $("preview").innerHTML = `<article class="q">
      <div class="q-head"><span class="q-title">Question 1 <span class="marks">${qm ? "(marks set by us)" : `(${r.marks} mark${r.marks === 1 ? "" : "s"})`}</span></span>
        ${qm ? "" : `<span class="diff d${r.difficulty}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= r.difficulty ? "f" : ""}"></i>`).join("")}&nbsp;${DIFF[r.difficulty]}</span>`}
        <span class="grow"></span>${prev ? `<span class="q-actions"><span class="prev-btn on">Previous parts (${r.prev.length})</span></span>` : ""}</div>
      ${prev ? `<div class="prev-parts"><div class="prev-label">Earlier parts of this question</div>${prev}</div>` : ""}
      <div class="q-body">${md(r.question) || '<p class="soft">(question)</p>'}${imgs}</div>${opts}
      <div class="src"><span class="tag">Yours</span> Source: ${r.source ? esc(r.source) : "Your question"}${r.credit ? " · submitted by " + esc(r.credit) : ""}${r.kind === "mc" ? " (multiple choice)" : ""} · <span class="dps">Dot point${r.dotpoints.length > 1 ? "s" : ""} ${esc(dps)}</span></div>
      ${qm ? `<div class="ans"><div class="ans-label">Solution</div><div class="ans-body soft">We'll write the solution, set the marks and difficulty and tag the dot points.</div></div>` : `<div class="ans"><div class="ans-label">${label}${r.kind === "mc" && r.correct ? " — " + r.correct : ""}</div><div class="ans-body">${md(r.answer)}${ansImgs}</div></div>`}
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
      const h = d.sub !== lastSub ? `<div class="dp-sub">${nm(d.topic)} — ${nm(d.sub)}</div>` : ""; lastSub = d.sub;
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
  async function addFiles(key, files) {
    const arr = key.startsWith("prev:") ? Q.prev[+key.slice(5)].images : Q[key];
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith("image/")) { toast(f.name + " isn't an image"); continue; }
      try { arr.push(await shrink(f)); n++; } catch (err) { toast("Couldn't read " + f.name); }
    }
    if (n) { renderImgs(); changed(); toast(n === 1 ? "Image added" : n + " images added"); }
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
        <div class="field full-only"><label class="lab">Marks</label><input type="number" min="1" max="20" data-pf="marks" value="${esc(x.marks)}"></div>
        <span style="flex:1"></span><button type="button" class="linkish" data-rmprev="${i}">Remove part</button></div>
      <label class="lab">Question</label><textarea rows="3" data-pf="question">${esc(x.question)}</textarea>
      <div class="imgs" data-imgs="prev:${i}"></div>
      <label class="drop" data-drop="prev:${i}"><input type="file" accept="image/*" multiple data-upload="prev:${i}"><span class="drop-btn">⬆ Upload image</span><span>or drag &amp; drop a diagram here</span></label>
      <label class="lab">Answer <span class="soft">(optional)</span></label><textarea rows="3" data-pf="answer">${esc(x.answer)}</textarea>
    </div>`).join("");
    renderImgs();
    if (window.HSCMath) HSCMath.attach($("form"));
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
    document.querySelectorAll("input[name=mode]").forEach((el) => (el.checked = el.value === Q.mode));
    $("form-title").textContent = !EDIT ? "Submit a question" : EDIT.kind === "repo" || EDIT.others ? "Edit question (admin)" : "Edit your question";
    modeUi(); renderPrev(); renderImgs();
  }
  function modeUi() {
    const q = Q.mode === "queue" && !(EDIT && EDIT.kind === "repo"), repo = EDIT && EDIT.kind === "repo";
    document.body.classList.toggle("queue-mode", q);
    document.querySelectorAll("[data-queue-only]").forEach((el) => (el.hidden = !q));
    document.querySelectorAll("[data-full-only]").forEach((el) => (el.hidden = q));
    $("mode-field").hidden = !!repo;
    $("source-box").hidden = !!repo;
    $("prev-box").hidden = !!repo;
    $("publish").textContent = repo ? "Save changes" : q ? (EDIT && EDIT.kind === "queue" ? "Save changes" : "Add to the queue") : (EDIT && EDIT.kind === "sub" ? "Save changes" : "Publish to the site");
    $("publish-hint").hidden = !!repo;
    let n = 0;
    document.querySelectorAll("section.fs").forEach((sec) => { const el = sec.querySelector("h2 .n"); if (el && !sec.hidden && getComputedStyle(sec).display !== "none") el.textContent = ++n; });
  }
  function authUi() {
    $("off-banner").hidden = A.enabled;
    $("signin-banner").hidden = !A.enabled || !!A.user;
    $("publish").disabled = !A.enabled;
    if (A.user && !Q.credit) { Q.credit = A.user.name.split(" ")[0]; $("credit").value = Q.credit; preview(); }
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

  /* ---------------- publish ---------------- */
  function docData() {
    const r = record();
    const d = { course: r.course, kind: r.kind, marks: r.marks, difficulty: r.difficulty, dotpoints: r.dotpoints, question: r.question,
      answer: r.answer, answer_type: r.answer_type, images: r.images || [], answer_images: r.answer_images || [], source: r.source || "",
      ref: r.ref || "", author: (r.credit || (A.user && A.user.name) || "").slice(0, 40), prev: r.prev || [], src: r.src };
    if (r.kind === "mc") { d.options = r.options; d.correct = r.correct || ""; }
    if (Q.mode === "queue" && !(EDIT && EDIT.kind === "repo")) {
      // just the question: we set the answer, marks, difficulty and dot points
      for (const k of ["answer", "answer_type", "marks", "difficulty"]) delete d[k];
      d.answer_images = []; d.dotpoints = [];
      d.prev = d.prev.map((x) => { const y = { ...x }; delete y.marks; return y; });
    }
    return d;
  }
  async function publish() {
    if (!A.enabled) { toast("Question submissions aren't open yet"); return; }
    if (!A.user) { await A.signIn(); await new Promise((r) => setTimeout(r, 300)); if (!A.user) return; }
    const pr = problems();
    if (pr.length) { preview(); $("problems").scrollIntoView({ behavior: "smooth", block: "center" }); toast("Fix the items listed first"); return; }
    const btn = $("publish"); btn.disabled = true;
    const data = docData();
    store.set("credit", Q.credit); store.set("lastCourse", Q.course);
    let msg, link;
    try {
      if (EDIT && EDIT.kind === "repo") {
        const f = { kind: data.kind, marks: data.marks, difficulty: data.difficulty, dotpoints: data.dotpoints, question: data.question, answer: data.answer,
          answer_type: data.answer_type, images: data.images, answer_images: data.answer_images };
        if (data.kind === "mc") { f.options = data.options; f.correct = data.correct; }
        await A.saveOverride(EDIT.qid, EDIT.course, f);
        msg = "Saved — your edit is live."; link = `${EDIT.course}.html#${encodeURIComponent(EDIT.qid)}`;
      } else if (Q.mode === "queue") {
        const id = await A.addQueue(data, EDIT && EDIT.kind === "queue" ? EDIT.id : null);
        if (EDIT && EDIT.kind === "sub") await A.deleteSubmission(EDIT.id);
        msg = "Added to the queue. We'll add the solution, marks, difficulty and dot points and publish it, usually within a day — track it under My submitted questions.";
        EDIT = { kind: "queue", id };
      } else {
        const id = await A.saveSubmission(data, EDIT && EDIT.kind === "sub" ? EDIT.id : null);
        if (EDIT && EDIT.kind === "queue") await A.deleteQueue(EDIT.id);
        msg = EDIT && EDIT.kind === "sub" ? "Saved — your changes are live." : "Published! Your question is now on the site.";
        link = `${data.course}.html#fs-${encodeURIComponent(id)}`;
        EDIT = { kind: "sub", id };
      }
    } catch (e) {
      btn.disabled = false; toast("Couldn't save — " + (e.code === "permission-denied" ? "you don't have permission to do that" : e.message), 5000); return;
    }
    btn.disabled = false;
    store.set("draft", null);
    $("done-box").hidden = false;
    $("done-box").innerHTML = `<b>${esc(msg)}</b>${link ? ` <a href="${link}">View it on the ${esc(COURSES[data.course])} page →</a>` : ""} <a href="mine.html">My submitted questions</a> · <button type="button" class="linkish" id="clear2">Add another question</button>`;
    toast(msg.split(".")[0]);
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
      if (t.id === "publish") { publish(); return; }
      if (t.id === "clear" || t.id === "clear2") { startNew(); return; }
      if (t.id === "signin-btn") { A.signIn && A.signIn(); return; }
      if (d.delsub || d.delq) {
        if (!confirm("Delete this question? This can't be undone.")) return;
        try { d.delsub ? await A.deleteSubmission(d.delsub) : await A.deleteQueue(d.delq); } catch (err) { toast("Couldn't delete — " + err.message); return; }
        if (EDIT && (EDIT.id === d.delsub || EDIT.id === d.delq)) startNew();
        toast("Deleted"); return;
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
      if (t.name === "mode") { Q.mode = t.value; modeUi(); changed(); return; }
      if (t.id === "src-type") { Q.src.type = t.value; srcFields(); changed(); return; }
      if (t.dataset.upload) { await addFiles(t.dataset.upload, t.files); t.value = ""; }
    });
    // drag & drop onto a drop zone or straight onto a text box; paste images into a text box
    const keyFor = (el) => {
      const z = el.closest("[data-drop]"); if (z) return z.dataset.drop;
      if (el.id === "question") return "images";
      if (el.id === "answer") return "answer_images";
      const pi = el.closest("[data-pi]"); if (pi && el.tagName === "TEXTAREA") return "prev:" + pi.dataset.pi;
      return null;
    };
    const target = (e) => e.target.closest && (e.target.closest("[data-drop]") || (e.target.tagName === "TEXTAREA" ? e.target : null));
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    form.addEventListener("dragover", (e) => { const t = target(e); if (!t || !hasFiles(e)) return; e.preventDefault(); t.classList.add("over"); });
    form.addEventListener("dragleave", (e) => { const t = target(e); if (t) t.classList.remove("over"); });
    form.addEventListener("drop", async (e) => {
      const t = target(e); if (!t || !hasFiles(e)) return;
      e.preventDefault(); t.classList.remove("over");
      const key = keyFor(t); if (key) await addFiles(key, e.dataTransfer.files);
    });
    form.addEventListener("paste", async (e) => {
      if (e.target.tagName !== "TEXTAREA") return;
      const files = [...(e.clipboardData && e.clipboardData.files || [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      const key = keyFor(e.target); if (key) await addFiles(key, files);
    });
  }
  function startNew() {
    const c = Q.course, credit = Q.credit, mode = Q.mode;
    Q = blank(c); Q.credit = credit; Q.mode = mode; EDIT = null;
    store.set("draft", null); history.replaceState(null, "", "submit.html");
    $("done-box").hidden = true;
    fill(); renderDp(); preview(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function fromDoc(x) {
    return { ...blank(x.course), course: x.course, kind: x.kind === "mc" ? "mc" : "written", question: x.question || "",
      options: Array.isArray(x.options) && x.options.length === 4 ? x.options.slice() : ["", "", "", ""], correct: x.correct || "",
      answer: x.answer || "", answer_type: x.answer_type || (SCIENCE(x.course) ? "sample" : "worked"),
      images: (x.images || []).slice(), answer_images: (x.answer_images || []).slice(), marks: +x.marks || 2, difficulty: +x.difficulty || 3,
      dotpoints: (x.dotpoints || []).slice(), src: x.src || { type: x.source ? "other" : "own", school: "", year: "", ref: x.ref || "", text: x.source || "" },
      credit: x.author || x.credit || "", prev: (x.prev || []).filter((p) => p.dropped == null).map((p) => ({ ref: p.ref || "", marks: p.marks || 1, question: p.question || "", answer: p.answer || "", images: p.images || [] })) };
  }
  // ?edit=fs-<id> (your live question) · ?edit=queue-<id> (your queued question) · ?edit=<question id>&course=<c> (admin: any question)
  async function edit(id, course) {
    await A.ready;
    if (!A.enabled) { toast("Editing isn't available yet"); return fill(); }
    if (!A.user) { toast("Sign in to edit this question", 4000); return fill(); }
    try {
      if (id.startsWith("fs-") || id.startsWith("queue-")) {
        const sub = id.startsWith("fs-"), docId = id.replace(/^(fs|queue)-/, "");
        const x = sub ? await A.getSubmission(docId) : await A.getQueued(docId);
        if (!x) { toast("That question no longer exists"); return fill(); }
        if (x.uid !== A.user.uid && !A.isAdmin) { toast("You can only edit your own questions"); return fill(); }
        Q = fromDoc(x); Q.mode = sub ? "full" : "queue"; EDIT = { kind: sub ? "sub" : "queue", id: docId, others: x.uid !== A.user.uid };
      } else {
        if (!A.isAdmin) { toast("Only admins can edit this question"); return fill(); }
        const data = await fetch("data/build/" + course + ".json", { cache: "no-cache" }).then((r) => r.json());
        const x = data.questions.find((q) => q.id === id);
        if (!x) { toast("Question not found"); return fill(); }
        const o = await A.getOverride(id);
        Q = fromDoc({ ...x, ...(o && o.fields ? o.fields : {}), course }); Q.mode = "full";
        EDIT = { kind: "repo", qid: id, course };
      }
    } catch (e) { toast("Couldn't load the question — " + e.message, 5000); return fill(); }
    fill(); loadSyllabus(Q.course); preview(); window.scrollTo({ top: 0 });
  }

  function init() {
    bind();
    const ps = new URLSearchParams(location.search), e = ps.get("edit");
    fill(); loadSyllabus(Q.course); preview(); authUi();
    if (A.onChange) A.onChange(authUi); else document.addEventListener("hscauth", authUi);
    A.ready.then(() => { authUi(); if (e) edit(e, ps.get("course")); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
