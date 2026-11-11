# HSC Paper Builder

Builds HSC practice papers and marking guides from a bank of questions split out of past papers (e.g. from THSC Online). Runs entirely in the browser and is hosted on GitHub Pages.

Subjects: Mathematics Advanced, Mathematics Extension 1, Mathematics Extension 2, Physics, Chemistry.

## Using it

1. **Import papers** – upload a paper PDF. Most THSC trial papers have the solutions at the back of the same file; the site finds where they start (you can change the page). If the marking guidelines are a separate PDF (as with NESA HSC papers), add it as well. Everything runs free in your browser:
   - Question numbers, lettered parts and margin marks are read from the PDF's text layer. Scanned pages, and pages whose fonts produce unreadable text, are read with OCR (Tesseract.js).
   - Solutions are matched to questions whatever the layout: NESA marking guidelines, "Question 11 (a)" headings, solution tables with "15a" / "13(a)(i)" row labels, or an annotated copy of the whole paper.
   - Multiple-choice answers come from answer keys (columns, rows or tables). In annotated copies, the circled or coloured option is detected from the page images.
   - You review and adjust every crop before saving.
2. **Build paper** – choose subject, total marks, number of multiple-choice questions, HSC/trial sources, year range and topics. Questions are picked to hit the mark total exactly, spread across topics, and ordered by their position in the original paper. *Swap* replaces a question with another worth the same marks.
3. **Download** the paper and marking guide as A4 PDFs.

## Topics

- **Maths** uses the focus areas of the NESA 2024 syllabuses (Advanced 14, Extension 1 11, Extension 2 5), first examined in the 2027 HSC. **Physics and Chemistry** use the Year 12 modules (5–8) examined in the HSC.
- When NESA marking guidelines are supplied, topics come from their **mapping grid** (older 2017 codes such as `ME-C1` are translated to 2024 focus areas).
- Otherwise a **classifier** (`model.json`) suggests topics from the question and solution text. It was trained on every NESA HSC exam since the current syllabuses, labelled by NESA's own grids. On held-out years it ranks the correct topic first 77–96% of the time depending on subject (see `tools/README.md`). Unsure suggestions are flagged for checking.
- Questions you save teach it: a near-identical question in your bank reuses your topics, and similar ones nudge the suggestion.

Optional: *Splitting method → Claude API* uses a Claude API key instead (paid per use). The free method is the default.

## Where data lives

- **Your imports** are stored in your browser (IndexedDB). They stay on that device and browser.
- **The published bank** is the `bank/` folder in this repo (`bank/index.json` + `bank/pages/*.jpg`). Everyone who opens the site sees it.

To publish your imports for everyone: *Question bank → Export bank* downloads `hsc-question-bank.zip`. Unzip it at the repo root (it replaces the `bank/` folder) and commit. *Import bank* loads a zip into another browser.

## Optional Claude API method

Only used if you switch the splitting method to Claude API. The key is saved only in your browser's localStorage and sent only to `api.anthropic.com`. Never commit a key to this repo.

## Hosting

GitHub Pages, deployed from the `main` branch root. `index.html` is self-contained; libraries load from CDNs (PDF.js 3.11.174, jsPDF 2.5.1, JSZip 3.10.1, and Tesseract.js 5.1.1 only when a scanned page needs OCR).

## Data model (`bank/index.json`)

- `papers[]` – `id, subject, source, year, kind (HSC|Trial), questionCount, totalMarks, assetIds[], createdAt`
- `questions[]` – `id, paperId, subject, source, year, kind, label, type (mcq|written), marks, topics[], segs[], sol[], ans, text, solText, pos, createdAt`
  - `segs` / `sol`: crops `{a: imageId, r: pageHeight/width, t: top, b: bottom}` (fractions of page height); image at `bank/pages/<a>.jpg`
  - `text` / `solText`: question and solution text, used to improve topic suggestions
  - `pos`: 0–1 position in the original paper, used for ordering

## Notes

- Questions are image crops, so they keep their original numbering; the generated paper adds its own number above each one.
- Topic lists follow the NESA Stage 6 syllabuses examined from the 2019 HSC. Custom topics can be added per subject.
