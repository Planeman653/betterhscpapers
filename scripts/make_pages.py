#!/usr/bin/env python3
"""Generate the three course pages from one template (run after editing the template)."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES = [("standard2", "Mathematics Standard 2", "Standard 2"),
           ("advanced", "Mathematics Advanced", "Advanced"),
           ("extension1", "Mathematics Extension 1", "Extension 1"),
           ("extension2", "Mathematics Extension 2", "Extension 2"),
           ("physics", "Physics", "Physics"),
           ("chemistry", "Chemistry", "Chemistry"),
           ("biology", "Biology", "Biology")]

# NESA's official HSC reference / formula sheets (Biology has none). Maths: the 2027 sample sheets for the 2024
# syllabuses (each level includes the levels below it), kept in assets/ref/.
SHEETS = {"standard2": ("Mathematics Standard 1 and 2 reference sheet (2027)", "assets/ref/mathematics-standard-reference-sheet-2027.pdf"),
          "advanced": ("Mathematics Advanced reference sheet (2027)", "assets/ref/mathematics-advanced-reference-sheet-2027.pdf"),
          "extension1": ("Mathematics Extension 1 reference sheet (2027) — includes Advanced", "assets/ref/mathematics-extension-1-reference-sheet-2027.pdf"),
          "extension2": ("Mathematics Extension 2 reference sheet (2027) — includes Extension 1 and Advanced", "assets/ref/mathematics-extension-2-reference-sheet-2027.pdf"),
          "physics": ("Physics formulae sheet, data sheet and periodic table", "assets/ref/physics-formulae-data-sheet-periodic-table.pdf"),
          "chemistry": ("Chemistry formulae sheet, data sheet and periodic table", "assets/ref/chemistry-formulae-data-sheet-periodic-table.pdf")}

DOC_ICON = ('<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" '
            'stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.5H7a2.5 2.5 0 0 0-2.5 2.5v14A2.5 2.5 0 0 0 7 21.5h10a2.5 2.5 0 0 0 2.5-2.5V8z"/>'
            '<path d="M14 2.5V6.5a1.5 1.5 0 0 0 1.5 1.5h4"/><path d="M8.5 12h7M8.5 15h7M8.5 18h4.5"/></svg>')


def sheet_btn(course):
    """floating round button, bottom-right of the screen"""
    if course not in SHEETS:
        return ""
    label, url = SHEETS[course]
    return (f'<a class="sheet-fab" href="{url}" target="_blank" rel="noopener" title="{label} (PDF)" aria-label="Open the {label} (PDF)">'
            f'{DOC_ICON}<span class="sheet-tip">{"Formula sheet" if course in ("physics", "chemistry") else "Reference sheet"}</span></a>')


HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="apple-touch-icon.png">
<title>{title}</title>
<meta name="description" content="HSC {name} trial-paper questions sorted by syllabus topic and dot point, with answers and a PDF builder.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
<link rel="stylesheet" href="assets/style.css">
<script src="assets/firebase-config.js"></script>
<script defer src="assets/render.js"></script>
<script type="module" src="assets/auth.js"></script>
<script defer src="assets/app.js"></script>
</head>"""

def tabs(active):
    return "".join(f'<a href="{c}.html" class="{"on" if c == active else ""}">{short}</a>' for c, _, short in COURSES) \
        + f'<a href="submit.html" class="submit-tab{" on" if active == "submit" else ""}">+ Submit a question</a>'

BODY = """
<body data-course="{course}">
<header class="topbar"><div class="topbar-inner">
  <a class="brand" href="index.html"><img class="brand-mark" src="assets/logo.svg" alt="" width="24" height="24">Better <span>HSC Papers</span></a>
  <nav class="tabs">{tabs}</nav>
  <span class="spacer"></span>
  <button class="filters-btn" id="filters-open">Filters</button>
  <button class="basket-btn" id="basket-open">PDF builder<b id="basket-n">0</b></button>
</div></header>

<div class="layout">
<aside class="sidebar" id="sidebar">
  <div class="panel-title">Search</div>
  <input class="search" id="search" type="search" placeholder="e.g. induction, Ascham, Q14">
  <div class="panel-title">Difficulty</div>
  <div class="chips">
    <button class="chip on" data-diff="1">1 Easy</button><button class="chip on" data-diff="2">2 Moderate</button>
    <button class="chip on" data-diff="3">3 Medium</button><button class="chip on" data-diff="4">4 Hard</button>
    <button class="chip on" data-diff="5">5 Very hard</button>
  </div>
  <div class="panel-title">Question type</div>
  <div class="chips"><button class="chip on" data-kind="mc">Multiple choice</button><button class="chip on" data-kind="written">Written</button></div>
  <div id="progress-panel" hidden>
    <div class="panel-title">Your progress</div>
    <div class="soft" id="done-count" style="font-size:13.5px;margin-bottom:6px"></div>
    <div class="seg-wrap" id="show-wrap"><span class="lab-inline">Show:</span>
      <div class="seg" id="show-done" role="group" aria-label="Show"><button type="button" data-show="all">All</button><button type="button" data-show="todo">Uncompleted</button><button type="button" data-show="done">Completed</button></div></div>
  </div>
  <div class="panel-title">Answers</div>
  <label class="switch"><input type="checkbox" id="answers"> Show all answers</label>
  <div class="panel-title">Sort &amp; group</div>
  <div class="row">
    <select id="sort" aria-label="Sort">
      <option value="syllabus">Syllabus order</option>
      <option value="diff-asc">Difficulty: easy → hard</option>
      <option value="diff-desc">Difficulty: hard → easy</option>
      <option value="newest">Newest paper first</option>
      <option value="marks">Marks: low → high</option>
    </select>
    <select id="group" aria-label="Group">
      <option value="subtopic">Group by topic</option>
      <option value="dotpoint">Group by dot point</option>
      <option value="none">No grouping</option>
    </select>
  </div>
  <label class="lab-inline" for="per-page">Questions per page
    <select id="per-page"><option value="20">20</option><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="0">All (slower)</option></select>
  </label>
  <div class="panel-title" style="display:flex;align-items:center;gap:8px">Topics &amp; dot points <span style="flex:1"></span><button class="linkish" id="clear-topics">clear</button></div>
  <label class="switch" style="font-size:13px;margin-bottom:6px"><input type="checkbox" id="hide-empty" checked> Hide dot points with no questions</label>
  <div class="tree" id="tree"></div>
  <details style="margin-top:12px"><summary class="panel-title" style="cursor:pointer">Source papers</summary><div id="papers"></div></details>
  <div style="margin-top:14px"><button class="btn" id="reset">Reset all filters</button></div>
</aside>

<main class="main">
  <div class="doc">
    <div class="doc-head">
      <h1>HSC {name}</h1>
      <div class="sub">Question Bank by Topic</div>
      <p id="sources"></p>
      <p>Questions are grouped by syllabus {unit}, then by {subunit}. The source paper and marks are shown under each question. <span id="generated"></span></p>
    </div>
    <div class="toolbar">
      <span class="count" id="count"></span><span style="flex:1"></span>
      <button class="btn" id="add-all">Add all shown to PDF</button>
    </div>
    <nav class="contents" id="contents"></nav>
    <div class="ctx-wrap" id="ctx-wrap"><div class="ctx-bar" id="ctx-bar" hidden aria-hidden="true"></div></div>
    <div id="questions"><div class="none">Loading…</div></div>
  </div>
</main>
</div>

<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" aria-label="PDF builder">
  <header><h3>PDF builder</h3><button class="btn" id="drawer-close">Close</button></header>
  <div class="body">
    <label for="pdf-title">Title</label>
    <input type="text" id="pdf-title" placeholder="{name} — Practice Questions">
    <label for="pdf-answers">Answers</label>
    <select id="pdf-answers"><option value="end">Answer key at the end</option><option value="inline">Under each question</option><option value="none">No answers</option></select>
    <label for="pdf-space">Working space (written questions)</label>
    <select id="pdf-space"><option value="none">None</option><option value="s">Small</option><option value="l">Large</option></select>
    <label for="pdf-order">Order</label>
    <select id="pdf-order"><option value="added">Order added</option><option value="syllabus">Syllabus order</option><option value="diff">Easy → hard</option></select>
    <label class="switch" style="margin-top:12px;color:var(--ink)"><input type="checkbox" id="pdf-src" checked> Show source of each question</label>
    <label>Selected <span id="basket-marks"></span></label>
    <ol id="basket-list"></ol>
  </div>
  <footer><button class="btn" id="basket-clear">Clear</button><button class="btn primary" id="make-pdf">Generate PDF</button></footer>
</aside>
<div id="toast" style="display:none;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:var(--accent-ink);padding:8px 16px;border-radius:999px;z-index:60;font-size:14px"></div>
{sheet}
<div id="print-root"></div>
</body>
</html>
"""

for course, name, short in COURSES:
    html = HEAD.format(title=f"HSC {name} — Better HSC Papers", name=name) + BODY.format(course=course, name=name, tabs=tabs(course), sheet=sheet_btn(course),
        unit="module" if course in ("physics", "chemistry", "biology") else "topic",
        subunit="inquiry question" if course in ("physics", "chemistry", "biology") else "subtopic")
    open(os.path.join(ROOT, f"{course}.html"), "w").write(html)
    print("wrote", course + ".html")
