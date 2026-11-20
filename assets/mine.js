/* Better HSC Papers — "My submitted questions": the signed-in user's live and queued questions. */
(function () {
  "use strict";
  const A = window.HSCAuth;
  const { esc } = window.HSCRender;
  const $ = (id) => document.getElementById(id);
  const NAMES = { standard1: "Standard 1", standard2: "Standard 2", advanced: "Advanced", extension1: "Extension 1", extension2: "Extension 2", physics: "Physics", chemistry: "Chemistry", biology: "Biology" };
  const toast = (m) => { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 2600); };
  const when = (ms) => (ms ? new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");
  const snippet = (t) => { const x = String(t || "").replace(/\$[^$]*\$/g, "…").replace(/[#*_>`|]/g, "").replace(/\s+/g, " ").trim(); return x.length > 140 ? x.slice(0, 140) + "…" : x; };
  const get = (f) => fetch("data/build/" + f, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

  let tok = 0;
  async function render() {
    const my = ++tok;
    $("gate").hidden = true;
    if (!A.enabled) { $("mine").innerHTML = ""; $("gate").hidden = false; $("gate").innerHTML = "<span>Logins aren't switched on yet.</span>"; return; }
    if (!A.user) {
      $("mine").innerHTML = ""; $("gate").hidden = false;
      $("gate").innerHTML = `<span>Sign in to see the questions you've submitted.</span><button class="btn primary" type="button" id="g-in">Sign in</button>`;
      $("g-in").onclick = () => A.signIn(); return;
    }
    $("mine").innerHTML = `<div class="soft">Loading…</div>`;
    let m, done, skipped;
    try { [m, done, skipped] = await Promise.all([A.mine(), get("queue_done.json"), get("queue_skipped.json")]); }
    catch (e) { $("mine").innerHTML = `<div class="soft">Couldn't load your questions (${esc(e.message)}).</div>`; return; }
    if (my !== tok) return;
    const items = [...m.submissions.map((x) => ({ ...x, _kind: "sub" })), ...m.queue.map((x) => ({ ...x, _kind: "queue" }))]
      .sort((a, b) => (b.created || 0) - (a.created || 0));
    if (!items.length) { $("mine").innerHTML = `<div class="soft">You haven't submitted any questions yet. <a href="submit.html">Submit one →</a></div>`; return; }
    $("mine").innerHTML = items.map((x) => {
      let status, actions;
      if (x._kind === "sub") {
        status = '<span class="tag live">Live</span>';
        actions = `<a class="btn" href="${x.course}.html#fs-${encodeURIComponent(x._id)}">View</a><a class="btn" href="submit.html?edit=fs-${encodeURIComponent(x._id)}">Edit</a><button type="button" class="btn" data-delsub="${esc(x._id)}">Delete</button>`;
      } else if (done[x._id]) {
        status = '<span class="tag live">Live — solution added</span>';
        actions = `<a class="btn" href="${x.course}.html#${encodeURIComponent(done[x._id])}">View</a>`;
      } else if (skipped[x._id] != null) {
        status = `<span class="tag">Not added</span> <span class="soft">${esc(skipped[x._id])}</span>`;
        actions = `<button type="button" class="btn" data-delq="${esc(x._id)}">Delete</button>`;
      } else {
        status = '<span class="tag wait">Waiting for solution</span>';
        actions = `<a class="btn" href="submit.html?edit=queue-${encodeURIComponent(x._id)}">Edit</a><button type="button" class="btn" data-delq="${esc(x._id)}">Delete</button>`;
      }
      return `<div class="a-row"><div class="a-main"><b>${esc(NAMES[x.course] || x.course)}</b>${x.dotpoints && x.dotpoints[0] ? " · " + esc(x.dotpoints[0]) : ""} ${status}
        <div class="soft a-meta">${when(x.created)}</div><div style="margin-top:4px">${x.question ? esc(snippet(x.question)) : "📷 Photo of the question"}</div></div><div class="a-act">${actions}</div></div>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("mine").addEventListener("click", async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      const { delsub, delq } = t.dataset;
      if (!delsub && !delq) return;
      if (!confirm("Delete this question? This can't be undone.")) return;
      try { delsub ? await A.deleteSubmission(delsub) : await A.deleteQueue(delq); } catch (err) { toast("Couldn't delete — " + err.message); return; }
      toast("Deleted"); render();
    });
    A.ready.then(render);
    if (A.onChange) A.onChange(render); else document.addEventListener("hscauth", render);
  });
})();
