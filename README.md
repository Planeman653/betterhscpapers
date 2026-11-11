# HSC Paper Builder

Builds HSC practice papers and marking guides from a bank of questions split out of past papers (e.g. from THSC Online). Runs entirely in the browser and is hosted on GitHub Pages.

Subjects: Mathematics Advanced, Mathematics Extension 1, Mathematics Extension 2, Physics, Chemistry.

## Using it

1. **Import papers** – upload an exam PDF and, optionally, its marking guidelines PDF. The site splits the paper into questions in your browser, for free:
   - Question numbers, lettered parts and margin marks are read from the PDF's text layer.
   - Topics come from the **mapping grid** at the end of NESA marking guidelines. Without one (e.g. trial papers), topics are guessed from keywords.
   - The marking guide is split by its "Question 11 (a)" headings, and the multiple-choice answer key is read automatically.
   - Scanned PDFs (no text layer) are read with OCR (Tesseract.js), also in the browser.
   - You review and adjust every crop before saving.
2. **Build paper** – choose subject, total marks, number of multiple-choice questions, HSC/trial sources, year range and topics. Questions are picked to hit the mark total exactly, spread across topics, and ordered by their position in the original paper. *Swap* replaces a question with another worth the same marks.
3. **Download** the paper and marking guide as A4 PDFs.

Tested on the 2022 NESA HSC papers for Maths Advanced, Maths Extension 1, Physics and Chemistry: every question found, marks matched the paper totals exactly, and every topic came from the mapping grid.

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
- `questions[]` – `id, paperId, subject, source, year, kind, label, type (mcq|written), marks, topics[], segs[], sol[], ans, pos, createdAt`
  - `segs` / `sol`: crops `{a: imageId, r: pageHeight/width, t: top, b: bottom}` (fractions of page height); image at `bank/pages/<a>.jpg`
  - `pos`: 0–1 position in the original paper, used for ordering

## Notes

- Questions are image crops, so they keep their original numbering; the generated paper adds its own number above each one.
- Topic lists follow the NESA Stage 6 syllabuses examined from the 2019 HSC. Custom topics can be added per subject.
