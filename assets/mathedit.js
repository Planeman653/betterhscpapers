/* Better HSC Papers — visual equation editor (MathLive) that writes the LaTeX into a textarea/input for you. */
(function () {
  "use strict";
  const { tex } = window.HSCRender;
  // [button face (LaTeX), what to insert (MathLive template: #0 = selection, #? = empty box, #@ = what's before)]
  const PALETTE = {
    "Basics": [["\\frac{a}{b}", "\\frac{#@}{#?}"], ["x^{n}", "#@^{#?}"], ["x_{n}", "#@_{#?}"], ["\\sqrt{x}", "\\sqrt{#0}"], ["\\sqrt[n]{x}", "\\sqrt[#?]{#0}"],
      ["(x)", "\\left(#0\\right)"], ["|x|", "\\left|#0\\right|"], ["\\pm", "\\pm"], ["\\times", "\\times"], ["\\div", "\\div"], ["\\cdot", "\\cdot"],
      ["x^{\\circ}", "^{\\circ}"], ["\\pi", "\\pi"], ["\\infty", "\\infty"], ["e^{x}", "e^{#?}"], ["\\ln", "\\ln"], ["\\log_{a}", "\\log_{#?}"],
      ["\\sin", "\\sin"], ["\\cos", "\\cos"], ["\\tan", "\\tan"], ["\\sin^{-1}", "\\sin^{-1}"], ["\\cos^{-1}", "\\cos^{-1}"], ["\\tan^{-1}", "\\tan^{-1}"],
      ["\\text{abc}", "\\text{#?}"]],
    "Relations": [["=", "="], ["\\ne", "\\ne"], ["<", "<"], [">", ">"], ["\\le", "\\le"], ["\\ge", "\\ge"], ["\\approx", "\\approx"], ["\\equiv", "\\equiv"],
      ["\\propto", "\\propto"], ["\\Rightarrow", "\\Rightarrow"], ["\\Leftrightarrow", "\\Leftrightarrow"], ["\\to", "\\to"], ["\\therefore", "\\therefore"],
      ["\\in", "\\in"], ["\\forall", "\\forall"], ["\\exists", "\\exists"], ["\\mathbb{R}", "\\mathbb{R}"], ["\\mathbb{Z}", "\\mathbb{Z}"],
      ["\\mathbb{N}", "\\mathbb{N}"], ["\\mathbb{C}", "\\mathbb{C}"], ["\\cup", "\\cup"], ["\\cap", "\\cap"]],
    "Calculus": [["\\frac{dy}{dx}", "\\frac{d#?}{d#?}"], ["\\frac{d}{dx}", "\\frac{d}{dx}"], ["\\frac{d^2y}{dx^2}", "\\frac{d^2#?}{d#?^2}"], ["f'(x)", "#@'"],
      ["\\int", "\\int #? \\, d#?"], ["\\int_a^b", "\\int_{#?}^{#?} #? \\, d#?"], ["\\sum", "\\sum_{#?}^{#?}"], ["\\lim", "\\lim_{#? \\to #?}"],
      ["\\dot{x}", "\\dot{#0}"], ["\\ddot{x}", "\\ddot{#0}"], ["\\binom{n}{r}", "\\binom{#?}{#?}"], ["{}^{n}C_{r}", "{}^{#?}C_{#?}"], ["n!", "!"]],
    "Greek": ["alpha", "beta", "gamma", "delta", "Delta", "theta", "lambda", "mu", "sigma", "Sigma", "omega", "Omega", "phi", "rho", "epsilon", "tau"]
      .map((g) => ["\\" + g, "\\" + g]),
    "Vectors & complex": [["\\underset{\\sim}{a}", "\\underset{\\sim}{#0}"], ["\\vec{a}", "\\vec{#0}"], ["\\overrightarrow{AB}", "\\overrightarrow{#0}"],
      ["\\hat{\\imath}", "\\hat{\\imath}"], ["\\hat{\\jmath}", "\\hat{\\jmath}"], ["\\hat{k}", "\\hat{k}"],
      ["\\begin{pmatrix}a\\\\b\\end{pmatrix}", "\\begin{pmatrix}#?\\\\#?\\end{pmatrix}"], ["\\begin{pmatrix}a\\\\b\\\\c\\end{pmatrix}", "\\begin{pmatrix}#?\\\\#?\\\\#?\\end{pmatrix}"],
      ["\\bar{z}", "\\overline{#0}"], ["i", "i"], ["\\operatorname{Re}", "\\operatorname{Re}"], ["\\operatorname{Im}", "\\operatorname{Im}"],
      ["\\operatorname{Arg}", "\\operatorname{Arg}"], ["\\operatorname{cis}", "\\operatorname{cis}"]],
    "Science": [["\\text{m s}^{-1}", "\\text{ m s}^{-1}"], ["\\text{m s}^{-2}", "\\text{ m s}^{-2}"], ["\\times10^{n}", "\\times 10^{#?}"],
      ["^{\\circ}\\text{C}", "^{\\circ}\\text{C}"], ["\\text{mol L}^{-1}", "\\text{ mol L}^{-1}"], ["\\Omega", "\\Omega"], ["\\mu", "\\mu"],
      ["\\Delta H", "\\Delta H"], ["\\rightarrow", "\\rightarrow"], ["\\rightleftharpoons", "\\rightleftharpoons"], ["\\text{H}_2\\text{O}", "\\text{#?}_{#?}"],
      ["\\text{X}^{2+}", "\\text{#?}^{#?}"], ["\\text{(aq)}", "\\text{(aq)}"], ["\\text{(s)}", "\\text{(s)}"], ["\\text{(g)}", "\\text{(g)}"], ["\\text{(l)}", "\\text{(l)}"]],
  };
  const MATH = /\\\$|\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let dlg, mf, scrim, target = null, range = [0, 0], tab = "Basics";

  function setup() {
    dlg = document.getElementById("mathdlg");
    mf = document.getElementById("mf");
    if (!dlg || !mf) return;
    if (window.MathfieldElement) {
      MathfieldElement.soundsDirectory = null;
      MathfieldElement.plonkSound = null;
    }
    // Not a modal dialog: a modal would make MathLive's on-screen maths keyboard (attached to <body>) unclickable.
    scrim = document.createElement("div"); scrim.className = "math-scrim"; document.body.appendChild(scrim);
    scrim.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && dlg.open) { e.preventDefault(); close(); } });
    if (window.mathVirtualKeyboard) mathVirtualKeyboard.addEventListener("geometrychange", () => {
      const h = mathVirtualKeyboard.visible ? mathVirtualKeyboard.boundingRect.height : 0;
      dlg.style.setProperty("--kb", h + "px");
    });
    mf.smartMode = false;
    mf.mathVirtualKeyboardPolicy = "auto";
    mf.addEventListener("input", sync);
    const tabs = document.getElementById("ptabs");
    tabs.innerHTML = Object.keys(PALETTE).map((k) => `<button type="button" class="chip${k === tab ? " on" : ""}" data-ptab="${k}">${k}</button>`).join("");
    tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-ptab]"); if (b) { tab = b.dataset.ptab; tabs.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b)); palette(); } });
    document.getElementById("palette").addEventListener("mousedown", (e) => e.preventDefault());   // keep focus in the field
    document.getElementById("palette").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ins]"); if (!b) return;
      mf.executeCommand(["insert", b.dataset.ins, { focus: true, feedback: false, selectionMode: "placeholder" }]);
      mf.focus(); sync();
    });
    dlg.addEventListener("click", (e) => { if (e.target.closest("[data-mclose]")) close(); });
    document.getElementById("mf-insert").addEventListener("click", insert);
    mf.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); insert(); } });
    palette();
  }
  function palette() {
    document.getElementById("palette").innerHTML = PALETTE[tab].map(([face, ins]) =>
      `<button type="button" class="pbtn" data-ins="${ins.replace(/"/g, "&quot;")}" title="${face.replace(/"/g, "&quot;")}">${tex(face, false)}</button>`).join("");
  }
  function latex() {
    return (mf.getValue("latex-expanded") || mf.value || "").trim();
  }
  function sync() {
    const l = latex();
    document.getElementById("mf-latex").textContent = l || "(empty)";
    document.getElementById("mf-msg").textContent = "";
  }

  // Open for a textarea/input. If the cursor is inside $...$, edit that equation; if text is selected, start from it.
  function open(el) {
    if (!dlg) setup();
    if (!dlg) return;
    target = el;
    const v = el.value, s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s;
    let start = s, end = e, src = v.slice(s, e), display = false, m;
    MATH.lastIndex = 0;
    while ((m = MATH.exec(v))) {
      if (m[0] === "\\$") continue;
      if (s >= m.index && e <= m.index + m[0].length) { start = m.index; end = m.index + m[0].length; src = m[1] ?? m[2]; display = m[1] != null; break; }
    }
    range = [start, end];
    mf.value = src.trim();
    document.getElementById("mf-display").checked = display;
    document.getElementById("mf-display").closest("label").hidden = el.tagName !== "TEXTAREA";
    document.getElementById("mathdlg-h").textContent = src ? "Edit equation" : "Insert equation";
    sync();
    dlg.show(); scrim.classList.add("show"); document.body.classList.add("math-open");
    setTimeout(() => { mf.focus(); mf.executeCommand("moveToMathfieldEnd"); }, 30);
  }
  function close() {
    if (window.mathVirtualKeyboard) try { mathVirtualKeyboard.hide(); } catch (e) {}
    dlg.close(); scrim.classList.remove("show"); document.body.classList.remove("math-open");
    if (target) target.focus();
  }
  function insert() {
    let l = latex();
    const msg = document.getElementById("mf-msg");
    if (/\\placeholder/.test(l)) { msg.textContent = "Fill in or delete the empty boxes first."; return; }
    if (!l) { msg.textContent = "The equation is empty."; return; }
    l = l.replace(/\$/g, "\\$");
    const display = document.getElementById("mf-display").checked && target.tagName === "TEXTAREA";
    const v = target.value;
    let before = v.slice(0, range[0]), after = v.slice(range[1]);
    let piece = display ? `$$${l}$$` : `$${l}$`;
    if (display) {
      if (before && !before.endsWith("\n")) piece = "\n" + piece;
      if (!after.startsWith("\n")) piece += "\n";
    } else {
      if (before && /[\w.,:;)]$/.test(before)) piece = " " + piece;
      if (after && /^[\w(]/.test(after)) piece += " ";
    }
    target.value = before + piece + after;
    const caret = (before + piece).length;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    close();
    target.setSelectionRange(caret, caret);
  }

  // Put an "Insert equation" button on every textarea / option input in `root` that doesn't have one yet.
  function attach(root) {
    (root || document).querySelectorAll("textarea, input[data-opt]").forEach((el) => {
      if (el.dataset.mathBtn) return;
      el.dataset.mathBtn = "1";
      const b = document.createElement("button");
      b.type = "button";
      b.className = el.tagName === "TEXTAREA" ? "mathbtn" : "mathbtn small";
      b.innerHTML = el.tagName === "TEXTAREA" ? "<b>√x</b> Insert equation" : "<b>√x</b>";
      b.title = "Insert or edit an equation (no LaTeX needed)";
      b.addEventListener("mousedown", (e) => e.preventDefault());   // keep the textarea's cursor position
      b.addEventListener("click", () => open(el));
      if (el.tagName === "TEXTAREA") {
        const bar = document.createElement("div");
        bar.className = "mathbar";
        bar.appendChild(b);
        el.parentNode.insertBefore(bar, el);
      } else el.insertAdjacentElement("afterend", b);
    });
  }

  window.HSCMath = { attach, open };
})();
