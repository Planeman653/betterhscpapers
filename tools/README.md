# Topic model training

`model.json` (at the repo root) is the topic classifier the site uses. It is a linear SVM per subject over
words and character 2–4-grams from each question and its solution, trained on every NESA HSC exam since the
current syllabuses (Maths 2020–2025, Physics and Chemistry 2019–2025). Labels come from the mapping grid in
each paper's marking guidelines; 2017 Maths codes are translated to the 2024 syllabus focus areas by
`LEGACY` in `index.html`.

1. Download the exam and marking-guideline PDFs listed in `nesa_papers.txt` into `site/corpus/`, and serve
   the site locally (`python3 -m http.server 8765`).
2. `python3 extract_corpus.py` runs the site's own PDF splitter and grid parser in headless Chrome
   (Playwright) and writes `corpus.json`.
3. `python3 evaluate_model.py` reports leave-one-year-out accuracy.
4. `python3 train_model.py 0.01` writes `model.json` (weights below 0.01 pruned).

Held-out accuracy (correct topic ranked first / in top two):
Maths Advanced 77% / 84%, Ext 1 80% / 88%, Ext 2 96% / 97%, Physics 93% / 97%, Chemistry 90% / 98%.
