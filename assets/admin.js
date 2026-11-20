/* Better HSC Papers — admin page: flags, community questions, the solution queue, and edited/deleted questions. */
(function () {
  "use strict";
  const A = window.HSCAuth;
  const { esc, md } = window.HSCRender;
  const $ = (id) => document.getElementById(id);
  const NAMES = { standard1: "Standard 1", standard2: "Standard 2", advanced: "Advanced", extension1: "Extension 1", extension2: "Extension 2", physics: "Physics", chemistry: "Chemistry", biology: "Biology" };
  let tab = "flags", D = null;
  const built = {};
  const toast = (m) => { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 2600); };
  const when = (ms) => (ms ? new Date(ms).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
  const course = (c) => `<b>${esc(NAMES[c] || c || "?")}</b>`;

  function bank(c) {
    if (!built[c]) built[c] = fetch("data/build/" + c + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { questions: [] })).catch(() => ({ questions: [] }));
    return built[c];
  }
  async function questionText(qid, c) {
    if (qid.startsWith("fs-")) { const s = D.subs.find((x) => x._id === qid.slice(3)); return s ? s.question : "(deleted)"; }
    const b = await bank(c); const q = b.questions.find((x) => x.id === qid);
    return q ? q.question : "(not found)";
  }
  const preview = (t, imgs) => `<details class="a-prev"><summary>${t ? esc(String(t).replace(/\$[^$]*\$/g, "…").replace(/\s+/g, " ").slice(0, 140)) : "📷 Photo of the question"}</summary><div class="q-body">${md(t || "")}${(imgs || []).map((s) => `<img src="${esc(s)}" alt="" style="max-width:100%">`).join("")}</div></details>`;

  async function load() {
    $("list").innerHTML = `<div class="soft">Loading…</div>`;
    const [flags, subs, queue, edits, done] = await Promise.all([A.allFlags(), A.allSubmissions(), A.allQueue(), A.allOverrides(),
      fetch("data/build/queue_done.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("data/build/queue_skipped.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))]).then((r) => { r[4]._skipped = r.pop(); return r; });
    const byNew = (a, b) => (b.created || b.updated || 0) - (a.created || a.updated || 0);
    D = { flags: flags.sort(byNew), subs: subs.sort(byNew), queue: queue.sort(byNew), edits: edits.sort(byNew), done };
    $("n-flags").textContent = flags.filter((f) => f.status !== "resolved").length || "";
    $("n-subs").textContent = subs.length || "";
    $("n-queue").textContent = queue.filter((q) => !done[q._id] && done._skipped[q._id] == null).length || "";
    $("n-edits").textContent = edits.length || "";
    render();
  }

  async function render() {
    const c = $("acourse").value;
    const keep = (x) => !c || x.course === c;
    $("show-resolved-l").hidden = tab !== "flags";
    let html = "";
    if (tab === "flags") {
      const list = D.flags.filter(keep).filter((f) => $("show-resolved").checked || f.status !== "resolved");
      const texts = await Promise.all(list.map((f) => questionText(f.qid, f.course)));
      html = list.map((f, i) => `<div class="a-row${f.status === "resolved" ? " resolved" : ""}">
        <div class="a-main">${course(f.course)} · ${esc(f.label || f.qid)} <span class="tag">${esc(f.reason)}</span>${f.status === "resolved" ? ' <span class="tag live">Resolved</span>' : ""}
          ${f.note ? `<div class="a-note">“${esc(f.note)}”</div>` : ""}<div class="soft a-meta">Reported by ${esc(f.name || "?")} · ${when(f.created)}</div>${preview(texts[i])}</div>
        <div class="a-act"><a class="btn" href="${f.course}.html#${encodeURIComponent(f.qid)}" target="_blank">View</a>
          <a class="btn" href="submit.html?edit=${encodeURIComponent(f.qid)}&course=${f.course}" target="_blank">Edit</a>
          ${f.status === "resolved" ? `<button class="btn" data-reopen="${f._id}">Reopen</button>` : `<button class="btn primary" data-resolve="${f._id}">Mark resolved</button>`}
          <button class="btn" data-qdel="${esc(f.qid)}" data-c="${f.course}">Delete question</button><button class="linkish" data-fdel="${f._id}">Delete report</button></div></div>`).join("");
      if (!list.length) html = `<div class="soft">No ${$("show-resolved").checked ? "" : "open "}reports.</div>`;
    } else if (tab === "subs") {
      const list = D.subs.filter(keep);
      html = list.map((s) => `<div class="a-row"><div class="a-main">${course(s.course)} · ${esc((s.dotpoints || []).join(", "))} · ${s.marks || "?"} marks · difficulty ${s.difficulty || "?"}
          <div class="soft a-meta">By ${esc(s.author || "?")} · ${when(s.created)}${s.updated && s.updated !== s.created ? " · edited " + when(s.updated) : ""}${s.source ? " · " + esc(s.source) : ""}</div>${preview(s.question, s.images)}</div>
        <div class="a-act"><a class="btn" href="${s.course}.html#fs-${encodeURIComponent(s._id)}" target="_blank">View</a><a class="btn" href="submit.html?edit=fs-${encodeURIComponent(s._id)}" target="_blank">Edit</a>
          <button class="btn" data-sdel="${s._id}">Delete</button></div></div>`).join("") || `<div class="soft">No community questions yet.</div>`;
    } else if (tab === "queue") {
      const list = D.queue.filter(keep);
      html = list.map((q) => {
        const pub = D.done[q._id], skip = D.done._skipped[q._id];
        return `<div class="a-row"><div class="a-main">${course(q.course)} ${pub ? '<span class="tag live">Published</span>' : skip != null ? `<span class="tag">Not added</span> <span class="soft">${esc(skip)}</span>` : '<span class="tag wait">Waiting for the daily run</span>'}
          <div class="soft a-meta">By ${esc(q.author || "?")} · ${when(q.created)}${q.source ? " · " + esc(q.source) : ""}${(q.images || []).length ? ` · ${q.images.length} diagram(s)` : ""}</div>${preview(q.question, q.images)}</div>
          <div class="a-act">${pub ? `<a class="btn" href="${q.course}.html#${encodeURIComponent(pub)}" target="_blank">View</a>` : `<a class="btn" href="submit.html?edit=queue-${encodeURIComponent(q._id)}" target="_blank">Edit</a>`}
          <button class="btn" data-kdel="${q._id}">${pub ? "Clear" : "Delete"}</button></div></div>`;
      }).join("") || `<div class="soft">The queue is empty.</div>`;
    } else {
      const list = D.edits.filter(keep);
      const texts = await Promise.all(list.map((o) => (o.fields ? o.fields.question : questionText(o._id, o.course))));
      html = list.map((o, i) => `<div class="a-row"><div class="a-main">${course(o.course)} · ${esc(o._id)} ${o.deleted ? '<span class="tag">Deleted</span>' : '<span class="tag">Edited</span>'}
          <div class="soft a-meta">${esc(o.by || "")} · ${when(o.updated)}</div>${preview(texts[i])}</div>
        <div class="a-act">${o.deleted ? "" : `<a class="btn" href="${o.course}.html#${encodeURIComponent(o._id)}" target="_blank">View</a><a class="btn" href="submit.html?edit=${encodeURIComponent(o._id)}&course=${o.course}" target="_blank">Edit</a>`}
          <button class="btn" data-revert="${esc(o._id)}">${o.deleted ? "Restore" : "Revert to original"}</button></div></div>`).join("") || `<div class="soft">No questions have been edited or deleted.</div>`;
    }
    $("list").innerHTML = html;
  }

  async function act(fn, msg) {
    try { await fn(); toast(msg); await load(); } catch (e) { toast("Failed — " + e.message); }
  }
  function bind() {
    $("atabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; tab = b.dataset.tab; document.querySelectorAll("#atabs .chip").forEach((x) => x.classList.toggle("on", x === b)); render(); });
    $("acourse").addEventListener("change", render);
    $("show-resolved").addEventListener("change", render);
    $("reload").addEventListener("click", load);
    $("list").addEventListener("click", (e) => {
      const t = e.target.closest("button"); if (!t) return;
      const d = t.dataset;
      if (d.resolve) act(() => A.setFlagStatus(d.resolve, "resolved"), "Report resolved");
      else if (d.reopen) act(() => A.setFlagStatus(d.reopen, "open"), "Report reopened");
      else if (d.fdel) act(() => A.deleteFlag(d.fdel), "Report deleted");
      else if (d.qdel) { if (confirm("Delete this question from the site?")) act(() => (d.qdel.startsWith("fs-") ? A.deleteSubmission(d.qdel.slice(3)) : A.deleteQuestion(d.qdel, d.c)), "Question deleted"); }
      else if (d.sdel) { if (confirm("Delete this community question?")) act(() => A.deleteSubmission(d.sdel), "Deleted"); }
      else if (d.kdel) { if (confirm("Remove this from the queue?")) act(() => A.deleteQueue(d.kdel), "Removed from the queue"); }
      else if (d.revert) act(() => A.revertOverride(d.revert), "Restored the original question");
    });
  }

  function gate() {
    $("panel").hidden = true; $("gate").hidden = false;
    if (!A.enabled) { $("who").textContent = ""; $("gate").innerHTML = "<span>Logins aren't switched on yet.</span>"; return; }
    if (!A.user) { $("who").textContent = ""; $("gate").innerHTML = `<span>Sign in with an admin account.</span><button class="btn primary" type="button" id="g-in">Sign in</button>`; $("g-in").onclick = () => A.signIn(); return; }
    if (!A.isAdmin) { $("who").textContent = A.user.email; $("gate").innerHTML = "<span>This account doesn't have admin access.</span>"; return; }
    $("who").textContent = "Signed in as " + A.user.email;
    $("gate").hidden = true; $("panel").hidden = false;
    load();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    A.ready.then(gate);
    if (A.onChange) A.onChange(gate); else document.addEventListener("hscauth", gate);
  });
})();
