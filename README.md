# HSC Paper Builder

Builds HSC practice papers and marking guides from a bank of questions split out of past papers (e.g. from THSC Online).

Subjects: Mathematics Advanced, Mathematics Extension 1, Mathematics Extension 2, Physics, Chemistry.

## Features

- **Import papers** – upload an exam PDF and, optionally, its marking guidelines PDF. Each page is rendered with PDF.js and sent to Claude, which returns each question's crop, label, marks and syllabus topic, and matches marking-guide regions and multiple-choice answers to each question. All crops are reviewed and adjustable before saving.
- **Build paper** – choose subject, total marks, number of multiple-choice questions, HSC/trial sources, year range, and topics to include or exclude. Questions are picked to hit the mark total exactly (randomised subset-sum, interleaved across topics), then ordered by their position in the original paper. Any question can be swapped for another worth the same marks.
- **Export** – paper and marking guide download as separate A4 PDFs (jsPDF).
- **Question bank** – papers grouped by source; edit marks and topics, or delete a paper.

## How it runs

`index.html` is a single self-contained page built to run as a **claude.ai artifact**. It relies on artifact runtime capabilities through `window.claude.use(...)`:

| Capability | Used for |
|---|---|
| `db` | Question bank (`questions`, `papers`, `config/topics` collections) |
| `assets` | Stored page images (JPEG) that question crops point to |
| `sample` (with images) | Claude splitting and tagging PDF pages |
| `downloads` | Saving generated PDFs |
| `user` | Viewer identity / edit permission |

Opened outside claude.ai (e.g. GitHub Pages or a local file), the page loads but shows the bank as unavailable, since those capabilities don't exist there. Running it standalone would need a replacement backend (storage, file hosting, and a Claude API call for page splitting).

### Data model

- `papers/{id}` – `subject, source, year, kind (HSC|Trial), questionCount, totalMarks, assetIds[], createdAt`
- `questions/{id}` – `paperId, subject, source, year, kind, label, type (mcq|written), marks, topics[], segs[], sol[], ans, pos, createdAt`
  - `segs` / `sol`: crops as `{a: assetId, r: pageHeight/width, t: top, b: bottom}` (fractions of page height)
  - `pos`: 0–1 position in the original paper, used for ordering

## Notes

- Questions are image crops, so they keep their original numbering; the generated paper adds its own number above each one.
- Topic lists follow the NESA Stage 6 syllabuses examined from the 2019 HSC. Custom topics can be added per subject.

## Libraries (CDN)

- PDF.js 3.11.174
- jsPDF 2.5.1
