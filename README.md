# HSC Paper Builder

Builds HSC practice papers and marking guides from a bank of questions split out of past papers (e.g. from THSC Online). Runs entirely in the browser and is hosted on GitHub Pages.

Subjects: Mathematics Advanced, Mathematics Extension 1, Mathematics Extension 2, Physics, Chemistry.

## Using it

1. **Import papers** – add a Claude API key under *Claude settings* (create one at console.anthropic.com), then upload an exam PDF and, optionally, its marking guidelines PDF. Claude finds each question's crop, label, marks and syllabus topic, and matches marking-guide regions and multiple-choice answers. Review and adjust crops, then save. Without a key, questions can be cropped by hand.
2. **Build paper** – choose subject, total marks, number of multiple-choice questions, HSC/trial sources, year range and topics. Questions are picked to hit the mark total exactly, spread across topics, and ordered by their position in the original paper. *Swap* replaces a question with another worth the same marks.
3. **Download** the paper and marking guide as A4 PDFs.

## Where data lives

- **Your imports** are stored in your browser (IndexedDB). They stay on that device and browser.
- **The published bank** is the `bank/` folder in this repo (`bank/index.json` + `bank/pages/*.jpg`). Everyone who opens the site sees it.

To publish your imports for everyone: *Question bank → Export bank* downloads `hsc-question-bank.zip`. Unzip it at the repo root (it replaces the `bank/` folder) and commit. *Import bank* loads a zip into another browser.

## API key

The key is saved only in your browser's localStorage and sent only to `api.anthropic.com` (direct browser access). Splitting uses your API credit, roughly one request per four pages. Never commit a key to this repo.

## Hosting

GitHub Pages, deployed from the `main` branch root. `index.html` is self-contained; libraries load from cdnjs (PDF.js 3.11.174, jsPDF 2.5.1, JSZip 3.10.1).

## Data model (`bank/index.json`)

- `papers[]` – `id, subject, source, year, kind (HSC|Trial), questionCount, totalMarks, assetIds[], createdAt`
- `questions[]` – `id, paperId, subject, source, year, kind, label, type (mcq|written), marks, topics[], segs[], sol[], ans, pos, createdAt`
  - `segs` / `sol`: crops `{a: imageId, r: pageHeight/width, t: top, b: bottom}` (fractions of page height); image at `bank/pages/<a>.jpg`
  - `pos`: 0–1 position in the original paper, used for ordering

## Notes

- Questions are image crops, so they keep their original numbering; the generated paper adds its own number above each one.
- Topic lists follow the NESA Stage 6 syllabuses examined from the 2019 HSC. Custom topics can be added per subject.
