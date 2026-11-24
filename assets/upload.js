/* Better HSC Papers — "Upload a paper": whole papers / practice exams as photos or a PDF, queued for the daily task. */
(function () {
  "use strict";
  const A = window.HSCAuth;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NAMES = { standard2: "Standard 2", advanced: "Advanced", extension1: "Extension 1", extension2: "Extension 2", physics: "Physics", chemistry: "Chemistry", biology: "Biology" };
  const MAX_TOTAL = 20 * 1024 * 1024, MAX_FILES = 60;
  const toast = (m) => { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 3000); };
  const S = { course: "advanced", files: [], busy: false };   // files: {name, type, role, size, data(base64)}
  const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const total = () => S.files.reduce((a, f) => a + f.size, 0);

  function toBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
  }
  function shrink(file) {   // photos: scale down (max 1800 px wide) and re-encode as JPEG
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = async () => {
        const k = Math.min(1, 1800 / img.width);
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(async (b) => { try { res({ blob: b, type: "image/jpeg" }); } catch (e) { rej(e); } }, "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("unreadable")); };
      img.src = url;
    });
  }
  async function addFiles(role, list) {
    for (const f of [...list]) {
      if (S.files.length >= MAX_FILES) { toast("That's the maximum of " + MAX_FILES + " files"); break; }
      try {
        let blob = f, type = f.type, name = f.name;
        if (f.type.startsWith("image/")) { const r = await shrink(f); blob = r.blob; type = r.type; name = name.replace(/\.\w+$/, "") + ".jpg"; }
        else if (f.type !== "application/pdf") { toast(f.name + " isn't an image or PDF"); continue; }
        if (total() + blob.size > MAX_TOTAL) { toast("Too large — the total limit is 20 MB. Try fewer or smaller photos."); break; }
        S.files.push({ name, type, role, size: blob.size, data: await toBase64(blob) });
      } catch (e) { toast("Couldn't read " + f.name); }
    }
    drawFiles(); check();
  }
  function drawFiles() {
    for (const role of ["paper", "answers"]) {
      const l = S.files.map((f, i) => [f, i]).filter(([f]) => f.role === role);
      $("files-" + role).innerHTML = l.map(([f, i], n) => `<div class="a-row" style="padding:6px 10px"><div class="a-main">${role === "paper" ? "Page " + (n + 1) + " · " : ""}${esc(f.name)} <span class="soft">${kb(f.size)}</span></div><div class="a-act"><button type="button" class="btn" data-up="${i}" ${n === 0 ? "disabled" : ""} aria-label="Move up">↑</button><button type="button" class="btn" data-rm="${i}">Remove</button></div></div>`).join("");
    }
    $("total").textContent = S.files.length ? `${S.files.length} file${S.files.length === 1 ? "" : "s"} · ${kb(total())} of 20 MB` : "";
  }
  function problems() {
    const p = [];
    if (!$("title").value.trim()) p.push("Give the paper a name.");
    if (!S.files.some((f) => f.role === "paper")) p.push("Add at least one page of the paper.");
    return p;
  }
  function check(show) {
    const p = problems();
    $("problems").innerHTML = show ? p.map((x) => `<li>${esc(x)}</li>`).join("") : "";
    return !p.length;
  }

  async function send() {
    if (S.busy) return;
    if (!A.user) { A.signIn(); return; }
    if (!check(true)) return;
    S.busy = true; $("send").disabled = true; $("bar").hidden = false;
    const meta = { course: S.course, title: $("title").value.trim(), year: +$("year").value || new Date().getFullYear(), ptype: $("ptype").value, author: $("credit").value.trim() || undefined, note: $("note").value.trim() || undefined };
    try {
      await A.addUpload(meta, S.files, (n, t) => { $("bar").firstElementChild.style.width = Math.round((100 * n) / t) + "%"; });
    } catch (e) { toast("Upload failed — " + (e.message || e)); S.busy = false; $("send").disabled = false; $("bar").hidden = true; return; }
    S.busy = false; $("bar").hidden = true; $("send").disabled = false;
    S.files = []; drawFiles(); $("title").value = ""; $("note").value = "";
    $("done-box").hidden = false;
    $("done-box").innerHTML = `<b>Uploaded.</b> We'll type it out, tag the questions and publish it as a paper, usually within a day. Track it under <a href="mine.html">My submitted questions</a>.`;
    $("done-box").scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function gate() {
    $("off-banner").hidden = A.enabled;
    $("signin-banner").hidden = !A.enabled || !!A.user;
    $("send").textContent = A.user || !A.enabled ? "Upload paper" : "Sign in to upload";
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("course").innerHTML = Object.entries(NAMES).map(([c, n]) => `<button type="button" class="chip${c === S.course ? " on" : ""}" data-course="${c}">${n}</button>`).join("");
    $("course").addEventListener("click", (e) => { const b = e.target.closest("[data-course]"); if (!b) return; S.course = b.dataset.course; $("course").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b)); });
    document.querySelectorAll('input[type=file]').forEach((inp) => inp.addEventListener("change", () => { addFiles(inp.dataset.role, inp.files); inp.value = ""; }));
    document.querySelectorAll(".drop").forEach((d) => {
      d.addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("over"); });
      d.addEventListener("dragleave", () => d.classList.remove("over"));
      d.addEventListener("drop", (e) => { e.preventDefault(); d.classList.remove("over"); addFiles(d.dataset.role, e.dataTransfer.files); });
    });
    document.querySelector("main").addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]"), up = e.target.closest("[data-up]");
      if (rm) { S.files.splice(+rm.dataset.rm, 1); drawFiles(); check(); }
      else if (up) {   // swap with the previous file of the same role
        const i = +up.dataset.up; let j = i - 1; while (j >= 0 && S.files[j].role !== S.files[i].role) j--;
        if (j >= 0) { [S.files[i], S.files[j]] = [S.files[j], S.files[i]]; drawFiles(); }
      }
    });
    $("title").addEventListener("input", () => check());
    $("send").addEventListener("click", send);
    $("signin-btn").addEventListener("click", () => A.signIn());
    A.ready.then(gate);
    if (A.onChange) A.onChange(gate); else document.addEventListener("hscauth", gate);
    gate(); drawFiles();
  });
})();
